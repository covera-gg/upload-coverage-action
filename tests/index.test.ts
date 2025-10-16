import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@actions/core', () => {
  const outputs: Record<string, string> = {}
  return {
    getInput: vi.fn((name: string, opts?: { required?: boolean }) => {
      if (name === 'api-key') {
        if (opts?.required) {
          return 'fake-api-key'
        }
        return 'fake-api-key'
      }
      if (name === 'coverage-files') {
        return 'coverage/*.xml'
      }
      if (name === 'fail-on-error') {
        return 'false'
      }
      if (name === 'api-url') {
        return 'https://api.test'
      }
      return ''
    }),
    setOutput: vi.fn((name: string, value: string) => {
      outputs[name] = value
    }),
    setFailed: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    debug: vi.fn(),
  }
})

vi.mock('@actions/github', () => ({
  context: {
    eventName: 'pull_request',
    payload: {
      pull_request: {
        head: { ref: 'feature/test', sha: 'abcdef1234567890' },
        base: { ref: 'main', sha: 'fedcba0987654321' },
        number: 41,
        title: 'Test PR',
        user: { login: 'octocat', email: 'octocat@example.com' },
      },
    },
  },
}))

vi.mock('../src/commit', () => ({
  detectCommitInfo: vi.fn().mockResolvedValue({
    sha: 'abcdef1234567890',
    message: 'Test commit',
    authorName: 'Octo Cat',
    authorEmail: 'octo@example.com',
  }),
}))

vi.mock('../src/files', () => ({
  findCoverageFiles: vi.fn().mockResolvedValue(['coverage/clover.xml']),
}))

vi.mock('../src/context', () => ({
  detectPathContext: vi.fn().mockResolvedValue({}),
}))

vi.mock('../src/upload', () => ({
  uploadCoverage: vi.fn().mockResolvedValue({
    reportUrl: 'https://covera.gg/reports/123',
    reportId: '123',
  }),
}))

describe('index module integration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('runs without throwing when dependencies are mocked', async () => {
    await expect(import('../src/index')).resolves.toBeDefined()
    const { uploadCoverage } = await import('../src/upload')
    expect(uploadCoverage).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 41,
        prBaseBranch: 'main',
        prBaseSha: 'fedcba0987654321',
      })
    )
  })
})
