import { PrismaClient, Provider, GPUStatus, JobStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Clear existing data
  await prisma.job.deleteMany()
  await prisma.gpuHealth.deleteMany()
  await prisma.gpu.deleteMany()
  await prisma.user.deleteMany()
  await prisma.arbitrageSnapshot.deleteMany()

  console.log('🧹 Cleared existing data')

  // Create demo user
  const user = await prisma.user.create({
    data: {
      email: 'demo@gp4u.com',
      name: 'Demo User',
    },
  })

  console.log('👤 Created demo user')

  // Create GPUs with realistic specs and pricing
  const gpuData = [
    {
      name: 'NVIDIA A100 80GB',
      provider: Provider.AWS,
      vramGB: 80,
      pricePerHour: 4.10,
      region: 'us-east-1',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 95,
        memoryScore: 98,
        uptimeHours: 2847,
        pastUsageTags: 'TRAINING,INFERENCE',
      },
    },
    {
      name: 'NVIDIA A100 80GB',
      provider: Provider.GCP,
      vramGB: 80,
      pricePerHour: 3.93,
      region: 'us-central1',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 92,
        memoryScore: 96,
        uptimeHours: 3120,
        pastUsageTags: 'TRAINING,TRAINING,INFERENCE',
      },
    },
    {
      name: 'NVIDIA H100',
      provider: Provider.LAMBDA,
      vramGB: 80,
      pricePerHour: 2.49,
      region: 'us-west-2',
      status: GPUStatus.LIMITED,
      health: {
        thermalScore: 88,
        memoryScore: 94,
        uptimeHours: 1234,
        pastUsageTags: 'TRAINING,TRAINING',
      },
    },
    {
      name: 'NVIDIA H100',
      provider: Provider.AZURE,
      vramGB: 80,
      pricePerHour: 4.53,
      region: 'eastus',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 97,
        memoryScore: 99,
        uptimeHours: 876,
        pastUsageTags: 'INFERENCE,TRAINING',
      },
    },
    {
      name: 'NVIDIA RTX 4090',
      provider: Provider.RUNPOD,
      vramGB: 24,
      pricePerHour: 0.69,
      region: 'us-east',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 85,
        memoryScore: 91,
        uptimeHours: 4521,
        pastUsageTags: 'INFERENCE,IDLE',
      },
    },
    {
      name: 'NVIDIA A100 40GB',
      provider: Provider.AWS,
      vramGB: 40,
      pricePerHour: 3.06,
      region: 'us-west-2',
      status: GPUStatus.BUSY,
      health: {
        thermalScore: 90,
        memoryScore: 93,
        uptimeHours: 5632,
        pastUsageTags: 'TRAINING,TRAINING,TRAINING',
      },
    },
    {
      name: 'NVIDIA A100 40GB',
      provider: Provider.GCP,
      vramGB: 40,
      pricePerHour: 2.93,
      region: 'europe-west4',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 94,
        memoryScore: 97,
        uptimeHours: 2134,
        pastUsageTags: 'INFERENCE,INFERENCE',
      },
    },
    {
      name: 'NVIDIA RTX 4090',
      provider: Provider.LAMBDA,
      vramGB: 24,
      pricePerHour: 0.74,
      region: 'us-south-1',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 82,
        memoryScore: 88,
        uptimeHours: 6789,
        pastUsageTags: 'IDLE,INFERENCE,IDLE',
      },
    },
    {
      name: 'NVIDIA L40S',
      provider: Provider.RUNPOD,
      vramGB: 48,
      pricePerHour: 1.29,
      region: 'eu-central',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 89,
        memoryScore: 92,
        uptimeHours: 1567,
        pastUsageTags: 'TRAINING,INFERENCE',
      },
    },
    {
      name: 'NVIDIA H100',
      provider: Provider.RUNPOD,
      vramGB: 80,
      pricePerHour: 2.79,
      region: 'us-central',
      status: GPUStatus.AVAILABLE,
      health: {
        thermalScore: 96,
        memoryScore: 98,
        uptimeHours: 543,
        pastUsageTags: 'TRAINING',
      },
    },
  ]

  const gpus = []
  for (const data of gpuData) {
    const gpu = await prisma.gpu.create({
      data: {
        name: data.name,
        provider: data.provider,
        vramGB: data.vramGB,
        pricePerHour: data.pricePerHour,
        region: data.region,
        status: data.status,
        health: {
          create: {
            thermalScore: data.health.thermalScore,
            memoryScore: data.health.memoryScore,
            uptimeHours: data.health.uptimeHours,
            lastMaintenanceAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
            pastUsageTags: data.health.pastUsageTags,
          },
        },
      },
    })
    gpus.push(gpu)
  }

  console.log(`🎮 Created ${gpus.length} GPUs with health data`)

  // Create some demo jobs
  const jobsData = [
    {
      name: 'LLM Fine-tuning - Llama 3 8B',
      gpuIndex: 0,
      expectedDurationHours: 12.5,
      status: JobStatus.COMPLETE,
      scriptPath: '/training/llama3_finetune.py',
    },
    {
      name: 'Stable Diffusion Training',
      gpuIndex: 4,
      expectedDurationHours: 8.0,
      status: JobStatus.RUNNING,
      scriptPath: '/training/sd_train.py',
    },
    {
      name: 'Inference API Server',
      gpuIndex: 7,
      expectedDurationHours: 24.0,
      status: JobStatus.PENDING,
      scriptPath: '/inference/api_server.py',
    },
  ]

  for (const jobData of jobsData) {
    const gpu = gpus[jobData.gpuIndex]
    await prisma.job.create({
      data: {
        name: jobData.name,
        userId: user.id,
        gpuId: gpu.id,
        status: jobData.status,
        expectedDurationHours: jobData.expectedDurationHours,
        costEstimate: Number(gpu.pricePerHour) * jobData.expectedDurationHours,
        scriptPath: jobData.scriptPath,
      },
    })
  }

  console.log(`💼 Created ${jobsData.length} demo jobs`)

  // Create arbitrage snapshots for common scenarios
  const arbitrageData = [
    { gpuType: 'A100-80GB', provider: Provider.AWS, pricePerHour: 4.10 },
    { gpuType: 'A100-80GB', provider: Provider.GCP, pricePerHour: 3.93 },
    { gpuType: 'A100-80GB', provider: Provider.AZURE, pricePerHour: 4.25 },
    { gpuType: 'H100', provider: Provider.AWS, pricePerHour: 5.20 },
    { gpuType: 'H100', provider: Provider.AZURE, pricePerHour: 4.53 },
    { gpuType: 'H100', provider: Provider.LAMBDA, pricePerHour: 2.49 },
    { gpuType: 'H100', provider: Provider.RUNPOD, pricePerHour: 2.79 },
    { gpuType: 'RTX-4090', provider: Provider.RUNPOD, pricePerHour: 0.69 },
    { gpuType: 'RTX-4090', provider: Provider.LAMBDA, pricePerHour: 0.74 },
  ]

  for (const arb of arbitrageData) {
    await prisma.arbitrageSnapshot.create({
      data: {
        gpuType: arb.gpuType,
        numGpus: 1,
        durationHours: 1,
        provider: arb.provider,
        pricePerHour: arb.pricePerHour,
        totalCost: arb.pricePerHour,
      },
    })
  }

  console.log('💰 Created arbitrage snapshots')

  console.log('✅ Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
