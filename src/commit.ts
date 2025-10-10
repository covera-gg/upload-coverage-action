import * as core from '@actions/core'
import * as github from '@actions/github'
import { execSync } from 'child_process'

export interface CommitInfo {
  sha: string
  message: string
  authorName: string
  authorEmail: string
}

/**
 * Detects commit information from GitHub context
 * Handles both PR and push events
 */
export async function detectCommitInfo(): Promise<CommitInfo> {
  const context = github.context
  const eventName = context.eventName

  core.debug(`Event name: ${eventName}`)

  // For pull_request events
  if (eventName === 'pull_request' && context.payload.pull_request) {
    const pr = context.payload.pull_request
    const sha = pr.head.sha

    core.debug(`PR event detected, head SHA: ${sha}`)

    // Use gh CLI to fetch commit details (requires GH_TOKEN)
    try {
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      if (!token) {
        throw new Error('GITHUB_TOKEN or GH_TOKEN environment variable is required for PR events')
      }

      // Fetch commit details using GitHub API via gh CLI
      const commitJson = execSync(
        `gh api repos/${context.repo.owner}/${context.repo.repo}/commits/${sha}`,
        {
          encoding: 'utf-8',
          env: { ...process.env, GH_TOKEN: token },
        }
      )

      const commit = JSON.parse(commitJson)

      return {
        sha,
        message: commit.commit.message,
        authorName: commit.commit.author.name,
        authorEmail: commit.commit.author.email,
      }
    } catch (error) {
      core.warning(`Failed to fetch commit details via gh CLI: ${error}`)
      // Fallback to PR title and author
      return {
        sha,
        message: pr.title,
        authorName: pr.user.login,
        authorEmail: `${pr.user.login}@users.noreply.github.com`,
      }
    }
  }

  // For push events
  if (eventName === 'push' && context.payload.head_commit) {
    const commit = context.payload.head_commit

    return {
      sha: commit.id,
      message: commit.message,
      authorName: commit.author.name,
      authorEmail: commit.author.email,
    }
  }

  // Fallback: use current git HEAD
  core.warning('Unable to detect commit from GitHub context, using git HEAD')

  const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  const message = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim()
  const authorName = execSync('git log -1 --pretty=%an', { encoding: 'utf-8' }).trim()
  const authorEmail = execSync('git log -1 --pretty=%ae', { encoding: 'utf-8' }).trim()

  return {
    sha,
    message,
    authorName,
    authorEmail,
  }
}
