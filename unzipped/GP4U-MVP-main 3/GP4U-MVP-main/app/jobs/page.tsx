'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { JobCard } from '@/components/job-card'
import { Plus, Briefcase } from 'lucide-react'

type GPU = {
  id: string
  name: string
  provider: string
  pricePerHour: number
}

type Job = {
  id: string
  name: string
  status: string
  expectedDurationHours: number
  costEstimate: number
  scriptPath: string | null
  createdAt: string
  gpu: GPU
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [gpus, setGpus] = useState<GPU[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    gpuId: '',
    expectedDurationHours: '8',
    scriptPath: '',
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchJobs()
    fetchGPUs()
  }, [])

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs')
      const data = await res.json()
      setJobs(data)
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchGPUs = async () => {
    try {
      const res = await fetch('/api/jobs/gpus')
      const data = await res.json()
      setGpus(data)
    } catch (error) {
      console.error('Failed to fetch GPUs:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const selectedGPU = gpus.find((g) => g.id === formData.gpuId)
    if (!selectedGPU) return

    const duration = parseFloat(formData.expectedDurationHours)
    const costEstimate = selectedGPU.pricePerHour * duration

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          expectedDurationHours: duration,
          costEstimate,
        }),
      })

      if (res.ok) {
        setShowCreateForm(false)
        setFormData({
          name: '',
          gpuId: '',
          expectedDurationHours: '8',
          scriptPath: '',
        })
        fetchJobs()
      }
    } catch (error) {
      console.error('Failed to create job:', error)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Job Queue</h1>
          <p className="text-muted-foreground">Manage your GPU jobs and workloads</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Create Job
        </Button>
      </div>

      {/* Create Job Form */}
      {showCreateForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Create New Job</CardTitle>
            <CardDescription>Configure your GPU workload</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job-name">Job Name</Label>
                  <Input
                    id="job-name"
                    placeholder="e.g., LLM Training - GPT-2"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gpu-select">Select GPU</Label>
                  <Select
                    value={formData.gpuId}
                    onValueChange={(value) => setFormData({ ...formData, gpuId: value })}
                    required
                  >
                    <SelectTrigger id="gpu-select">
                      <SelectValue placeholder="Choose a GPU" />
                    </SelectTrigger>
                    <SelectContent>
                      {gpus.map((gpu) => (
                        <SelectItem key={gpu.id} value={gpu.id}>
                          {gpu.name} ({gpu.provider}) - ${gpu.pricePerHour}/hr
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Expected Duration (hours)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={formData.expectedDurationHours}
                    onChange={(e) =>
                      setFormData({ ...formData, expectedDurationHours: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="script-path">Script Path (optional)</Label>
                  <Input
                    id="script-path"
                    placeholder="/path/to/script.py"
                    value={formData.scriptPath}
                    onChange={(e) => setFormData({ ...formData, scriptPath: e.target.value })}
                  />
                </div>
              </div>

              {formData.gpuId && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Estimated Cost: </span>
                    <span className="font-bold text-lg">
                      $
                      {(
                        (gpus.find((g) => g.id === formData.gpuId)?.pricePerHour || 0) *
                        parseFloat(formData.expectedDurationHours || '0')
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit">Create Job</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Jobs List */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-semibold">Your Jobs</h2>
          <span className="text-sm text-muted-foreground">({jobs.length})</span>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading jobs...</p>
          </div>
        ) : jobs.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No jobs yet. Create your first job!</p>
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Job
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
