#!/usr/bin/env node
/**
 * GP4U Customer CLI
 *
 * Commands:
 *   gp4u login              — authenticate with the platform
 *   gp4u logout             — clear stored credentials
 *   gp4u gpus               — list available GPUs with pricing
 *   gp4u arbitrage          — show best deals across providers
 *   gp4u jobs               — list your jobs
 *   gp4u jobs submit        — submit a new job
 *   gp4u jobs status <id>   — check a specific job
 *   gp4u memory             — show your memory stakes
 *   gp4u clusters           — show your GPU clusters
 *   gp4u health             — platform health + chamber status
 *   gp4u config set-url     — change the API URL (for self-hosted)
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { config } from './config'
import { api, type GPU, type ArbitrageEntry } from './api'

const program = new Command()

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = chalk
const ok   = (msg: string) => console.log($.green('✓'), msg)
const warn = (msg: string) => console.log($.yellow('⚠'), msg)
const fail = (msg: string) => { console.error($.red('✗'), msg); process.exit(1) }

function requireAuth() {
  if (!config.isLoggedIn()) fail('Not logged in. Run: gp4u login')
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(4)}`
}

function fmtStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING:  $.yellow('PENDING'),
    RUNNING:  $.blue('RUNNING'),
    COMPLETE: $.green('COMPLETE'),
    FAILED:   $.red('FAILED'),
  }
  return map[status] ?? status
}

function table(rows: string[][]): void {
  if (rows.length < 2) return
  const headers = rows[0]
  const data    = rows.slice(1)
  const widths  = headers.map((h, i) =>
    Math.max(h.length, ...data.map(r => (r[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '').length))
  )
  const line = (row: string[]) =>
    row.map((cell, i) => cell.padEnd(widths[i] + 2)).join('')
  console.log($.bold(line(headers)))
  console.log($.gray('─'.repeat(widths.reduce((s, w) => s + w + 2, 0))))
  data.forEach(row => console.log(line(row)))
}

// ─── Program ──────────────────────────────────────────────────────────────────

program
  .name('gp4u')
  .description('GP4U — GPU compute marketplace CLI')
  .version('0.1.0')

// ─── Login ────────────────────────────────────────────────────────────────────

program
  .command('login')
  .description('Log in to GP4U')
  .action(async () => {
    const answers = await inquirer.prompt([
      { type: 'input',    name: 'email',    message: 'Email:' },
      { type: 'password', name: 'password', message: 'Password:', mask: '*' },
    ])

    const spinner = ora('Authenticating…').start()
    try {
      const res = await api.login(answers.email, answers.password)
      config.setAuth(res.token, res.subject_id, res.email)
      spinner.succeed(`Logged in as ${$.bold(res.email)}`)
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    config.logout()
    ok('Logged out')
  })

// ─── GPUs ─────────────────────────────────────────────────────────────────────

program
  .command('gpus')
  .description('List available GPUs')
  .option('--region <region>', 'Filter by region')
  .option('--min-vram <gb>',   'Minimum VRAM in GB')
  .option('--max-price <usd>', 'Maximum price per hour')
  .action(async (opts) => {
    const spinner = ora('Fetching GPUs…').start()
    try {
      const { gpus } = await api.listGpus({
        region:    opts.region,
        min_vram:  opts.minVram   ? parseFloat(opts.minVram)   : undefined,
        max_price: opts.maxPrice  ? parseFloat(opts.maxPrice)  : undefined,
      })
      spinner.stop()

      if (gpus.length === 0) { warn('No GPUs match your filters'); return }

      table([
        ['GPU', 'Provider', 'Region', 'VRAM', 'Price/hr', 'Status'],
        ...gpus.map((g: GPU) => [
          g.name,
          g.provider,
          g.region,
          `${g.vramGB}GB`,
          fmtCurrency(g.pricePerHour),
          g.status === 'AVAILABLE' ? $.green('AVAILABLE') : $.gray(g.status),
        ]),
      ])
      console.log()
      ok(`${gpus.length} GPU(s) found`)
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

// ─── Arbitrage ────────────────────────────────────────────────────────────────

program
  .command('arbitrage')
  .description('Show best GPU deals across all providers')
  .action(async () => {
    const spinner = ora('Scanning providers for best deals…').start()
    try {
      const data = await api.getArbitrage()
      spinner.stop()

      console.log()
      console.log($.bold.cyan('  Best Deal Right Now'))
      console.log($.cyan('  ─────────────────────────────────────'))
      console.log(`  ${$.bold(data.best.gpu)} via ${$.bold(data.best.provider)}`)
      console.log(`  ${$.green(fmtCurrency(data.best.price_usd) + '/hr')} — ${data.best.region}`)
      console.log()

      table([
        ['Provider', 'GPU', 'Region', 'Price/hr', 'Availability'],
        ...data.table.map((r: ArbitrageEntry) => [
          r.provider,
          r.gpu,
          r.region,
          fmtCurrency(r.price_usd),
          `${Math.round(r.availability_pct)}%`,
        ]),
      ])

      console.log()
      ok(`Potential savings vs retail: ${$.bold.green('$' + data.potential_savings_usd.toFixed(2))}`)
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

// ─── Jobs ─────────────────────────────────────────────────────────────────────

const jobs = program.command('jobs').description('Manage compute jobs')

jobs
  .command('list')
  .alias('ls')
  .description('List your jobs')
  .action(async () => {
    requireAuth()
    const spinner = ora('Fetching jobs…').start()
    try {
      const { jobs: list } = await api.listJobs()
      spinner.stop()

      if (list.length === 0) { warn('No jobs yet. Submit one with: gp4u jobs submit'); return }

      table([
        ['ID', 'Name', 'GPU', 'Status', 'Cost Est.', 'Created'],
        ...list.map(j => [
          j.id.slice(0, 8) + '…',
          j.name.slice(0, 24),
          `${j.gpu.name} (${j.gpu.provider})`,
          fmtStatus(j.status),
          fmtCurrency(j.costEstimate),
          new Date(j.createdAt).toLocaleDateString(),
        ]),
      ])
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

jobs
  .command('submit')
  .description('Submit a new compute job')
  .option('--gpu-id <id>',       'GPU ID (from: gp4u gpus)')
  .option('--name <name>',       'Job name')
  .option('--image <image>',     'Docker image', 'pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime')
  .option('--hours <h>',         'Expected duration in hours', '1')
  .option('--workload <type>',   'Workload type (TRAINING, INFERENCE, FINE_TUNING)', 'INFERENCE')
  .option('--cmd <command>',     'Entrypoint command')
  .action(async (opts) => {
    requireAuth()

    // Interactive prompts for any missing fields
    const answers = await inquirer.prompt([
      {
        type:    'input',
        name:    'gpu_id',
        message: 'GPU ID (run `gp4u gpus` to list):',
        when:    !opts.gpuId,
      },
      {
        type:    'input',
        name:    'name',
        message: 'Job name:',
        default: `job-${Date.now().toString(36)}`,
        when:    !opts.name,
      },
    ])

    const gpu_id = opts.gpuId ?? answers.gpu_id
    const name   = opts.name   ?? answers.name

    const spinner = ora('Submitting job…').start()
    try {
      const { job } = await api.submitJob({
        gpu_id,
        name,
        workload_type:       opts.workload,
        expected_duration_h: parseFloat(opts.hours),
        docker_image:        opts.image,
        command:             opts.cmd ? opts.cmd.split(' ') : undefined,
      })
      spinner.succeed(`Job submitted: ${$.bold(job.id)}`)
      console.log()
      console.log(`  Status:    ${fmtStatus(job.status)}`)
      console.log(`  GPU:       ${job.gpu.name} (${job.gpu.provider}) — ${job.gpu.region}`)
      console.log(`  Est. cost: ${fmtCurrency(job.costEstimate)}/hr × ${opts.hours}h`)
      console.log()
      console.log(`  Monitor: ${$.cyan(`gp4u jobs status ${job.id}`)}`)
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

jobs
  .command('status <id>')
  .description('Check job status')
  .action(async (id) => {
    requireAuth()
    const spinner = ora('Fetching job…').start()
    try {
      const { job } = await api.getJob(id)
      spinner.stop()

      console.log()
      console.log(`  ${$.bold('Job')}  ${job.id}`)
      console.log(`  ${$.bold('Name')} ${job.name}`)
      console.log(`  ${$.bold('Status')} ${fmtStatus(job.status)}`)
      console.log(`  ${$.bold('GPU')} ${job.gpu.name} — ${job.gpu.provider} — ${job.gpu.region}`)
      console.log(`  ${$.bold('Cost est.')} ${fmtCurrency(job.costEstimate)}`)
      console.log(`  ${$.bold('Created')} ${new Date(job.createdAt).toLocaleString()}`)
      console.log()
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

// ─── Memory ───────────────────────────────────────────────────────────────────

program
  .command('memory')
  .description('Show your memory stakes (Mnemo chamber)')
  .action(async () => {
    requireAuth()
    const spinner = ora('Fetching stakes…').start()
    try {
      const { stakes, summary } = await api.listStakes()
      spinner.stop()

      console.log()
      console.log($.bold('  Memory Staking Summary'))
      console.log(`  VRAM staked:    ${summary.total_vram_gb} GB`)
      console.log(`  Active stakes:  ${summary.active_count}`)
      console.log(`  Total earned:   ${$.green('$' + summary.total_earned_usd.toFixed(4))}`)
      console.log()

      if (stakes.length > 0) {
        table([
          ['GPU', 'VRAM', 'RAM', 'Earned', 'Status'],
          ...stakes.map(s => [
            `${s.gpu.name} (${s.gpu.provider})`,
            `${s.vram_gb}GB`,
            `${s.ram_gb}GB`,
            $.green('$' + Number(s.total_earned_usd).toFixed(4)),
            s.is_active ? $.green('ACTIVE') : $.gray('INACTIVE'),
          ]),
        ])
      }

      console.log()
      ok('Stake memory at: gp4u.com/memory')
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

// ─── Clusters ─────────────────────────────────────────────────────────────────

program
  .command('clusters')
  .description('Show your GPU clusters')
  .action(async () => {
    requireAuth()
    const spinner = ora('Fetching clusters…').start()
    try {
      const { clusters, pools } = await api.listClusters()
      spinner.stop()

      if (clusters.length > 0) {
        console.log()
        console.log($.bold('  Your Clusters'))
        table([
          ['Name', 'GPUs', 'Type', 'Region', 'Status', 'Cost'],
          ...clusters.map(c => [
            c.name,
            `${c.gpu_count}×`,
            c.gpu_type,
            c.region,
            fmtStatus(c.status),
            fmtCurrency(c.total_cost),
          ]),
        ])
      } else {
        warn('No clusters yet.')
      }

      if (pools.length > 0) {
        console.log()
        console.log($.bold('  Available Multi-GPU Pools'))
        table([
          ['GPU', 'Provider', 'Region', 'Available', 'VRAM ea.', 'Price/GPU/hr'],
          ...pools.map(p => [
            p.gpu_type,
            p.provider,
            p.region,
            String(p.available_count),
            `${p.vram_gb}GB`,
            fmtCurrency(p.price_per_gpu_hr),
          ]),
        ])
      }

      console.log()
      ok('Reserve a cluster at: gp4u.com/clusters')
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

// ─── Health ───────────────────────────────────────────────────────────────────

program
  .command('health')
  .description('Platform health and chamber status')
  .action(async () => {
    const spinner = ora('Checking platform…').start()
    try {
      const data = await api.health()
      spinner.stop()

      const statusColor = data.status === 'ok' ? $.green : $.yellow
      console.log()
      console.log(`  Platform: ${statusColor(data.status.toUpperCase())}`)
      console.log(`  Events delivered: ${data.bus.events_delivered}`)
      console.log(`  Events dropped:   ${data.bus.events_dropped}`)
      console.log()

      if (data.chambers.length > 0) {
        table([
          ['Chamber', 'Mode', 'Events Received'],
          ...data.chambers.map(c => [
            c.chamber_id,
            c.mode === 'ACTIVE' ? $.green('ACTIVE')
              : c.mode === 'PASSIVE' ? $.yellow('PASSIVE')
              : $.gray(c.mode),
            String(c.events_received),
          ]),
        ])
      }
      console.log()
    } catch (e) {
      spinner.fail(String(e))
      process.exit(1)
    }
  })

// ─── Config ───────────────────────────────────────────────────────────────────

const cfg = program.command('config').description('Manage CLI configuration')

cfg
  .command('set-url <url>')
  .description('Set the API URL (for self-hosted deployments)')
  .action((url) => {
    config.setApiUrl(url)
    ok(`API URL set to: ${url}`)
  })

cfg
  .command('show')
  .description('Show current config')
  .action(() => {
    console.log()
    console.log(`  API URL:  ${config.apiUrl}`)
    console.log(`  Email:    ${config.email ?? 'not logged in'}`)
    console.log(`  Logged in: ${config.isLoggedIn() ? $.green('yes') : $.red('no')}`)
    console.log()
  })

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parse(process.argv)

// Show help if no command given
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
