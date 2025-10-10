import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectCommitInfo } from '../src/commit'
import * as github from '@actions/github'
import * as core from '@actions/core'
import { execSync } from 'child_process'

// Mock dependencies
vi.mock('@actions/core')
vi.mock('@actions/github', () => ({
  context: {
    eventName: '',
    payload: {},
  },
}))
vi.mock('child_process')

describe('detectCommitInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset context
    github.context.eventName = ''
    github.context.payload = {}
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('pull_request events', () => {
    it('should extract commit info from PR context', async () => {
      github.context.eventName = 'pull_request'
      github.context.payload = {
        pull_request: {
          head: {
            sha: 'abc123def456',
          },
          title: 'Add new feature',
          user: {
            login: 'octocat',
          },
        },
      }

      const result = await detectCommitInfo()

      expect(result).toEqual({
        sha: 'abc123def456',
        message: 'Add new feature',
        authorName: 'octocat',
        authorEmail: 'octocat@users.noreply.github.com',
      })
    })

    it('should handle PR with special characters in title', async () => {
      github.context.eventName = 'pull_request'
      github.context.payload = {
        pull_request: {
          head: {
            sha: 'xyz789',
          },
          title: 'Fix: Handle "quotes" and special chars!',
          user: {
            login: 'test-user',
          },
        },
      }

      const result = await detectCommitInfo()

      expect(result.message).toBe('Fix: Handle "quotes" and special chars!')
      expect(result.authorEmail).toBe('test-user@users.noreply.github.com')
    })
  })

  describe('push events', () => {
    it('should extract commit info from push event', async () => {
      github.context.eventName = 'push'
      github.context.payload = {
        head_commit: {
          id: 'commit123abc',
          message: 'Fix bug in parser\n\nDetailed description here',
          author: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        },
      }

      const result = await detectCommitInfo()

      expect(result).toEqual({
        sha: 'commit123abc',
        message: 'Fix bug in parser\n\nDetailed description here',
        authorName: 'John Doe',
        authorEmail: 'john@example.com',
      })
    })

    it('should handle push event with minimal commit data', async () => {
      github.context.eventName = 'push'
      github.context.payload = {
        head_commit: {
          id: 'minimal123',
          message: 'Update',
          author: {
            name: 'Bot',
            email: 'bot@example.com',
          },
        },
      }

      const result = await detectCommitInfo()

      expect(result.sha).toBe('minimal123')
      expect(result.message).toBe('Update')
    })
  })

  describe('fallback to git commands', () => {
    it('should use git commands when context is unavailable', async () => {
      github.context.eventName = 'workflow_dispatch'
      github.context.payload = {}

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'git rev-parse HEAD') return 'fallback123\n'
        if (cmd === 'git log -1 --pretty=%B') return 'Fallback commit message\n'
        if (cmd === 'git log -1 --pretty=%an') return 'Git User\n'
        if (cmd === 'git log -1 --pretty=%ae') return 'git@example.com\n'
        return ''
      })

      const result = await detectCommitInfo()

      expect(result).toEqual({
        sha: 'fallback123',
        message: 'Fallback commit message',
        authorName: 'Git User',
        authorEmail: 'git@example.com',
      })

      expect(core.warning).toHaveBeenCalledWith(
        'Unable to detect commit from GitHub context, using git HEAD'
      )
    })

    it('should trim whitespace from git output', async () => {
      github.context.eventName = 'unknown'
      github.context.payload = {}

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'git rev-parse HEAD') return '  sha-with-spaces  \n'
        if (cmd === 'git log -1 --pretty=%B') return '  Message  \n'
        if (cmd === 'git log -1 --pretty=%an') return '  Name  \n'
        if (cmd === 'git log -1 --pretty=%ae') return '  email@test.com  \n'
        return ''
      })

      const result = await detectCommitInfo()

      expect(result.sha).toBe('sha-with-spaces')
      expect(result.message).toBe('Message')
      expect(result.authorName).toBe('Name')
      expect(result.authorEmail).toBe('email@test.com')
    })
  })

  describe('edge cases', () => {
    it('should handle PR event without pull_request data', async () => {
      github.context.eventName = 'pull_request'
      github.context.payload = {} // Missing pull_request

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'git rev-parse HEAD') return 'fallback-sha\n'
        if (cmd === 'git log -1 --pretty=%B') return 'Fallback\n'
        if (cmd === 'git log -1 --pretty=%an') return 'User\n'
        if (cmd === 'git log -1 --pretty=%ae') return 'user@test.com\n'
        return ''
      })

      const result = await detectCommitInfo()

      expect(result.sha).toBe('fallback-sha')
      expect(core.warning).toHaveBeenCalled()
    })

    it('should handle push event without head_commit data', async () => {
      github.context.eventName = 'push'
      github.context.payload = {} // Missing head_commit

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'git rev-parse HEAD') return 'git-sha\n'
        if (cmd === 'git log -1 --pretty=%B') return 'Message\n'
        if (cmd === 'git log -1 --pretty=%an') return 'Author\n'
        if (cmd === 'git log -1 --pretty=%ae') return 'author@test.com\n'
        return ''
      })

      const result = await detectCommitInfo()

      expect(result.sha).toBe('git-sha')
      expect(core.warning).toHaveBeenCalled()
    })
  })
})
