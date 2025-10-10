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
 * Handles both PR and push events using only GitHub context data
 */
export async function detectCommitInfo(): Promise<CommitInfo> {
  const context = github.context
  const eventName = context.eventName

  core.debug(`Event name: ${eventName}`)

  // For pull_request events - use PR data directly from context
  if (eventName === 'pull_request' && context.payload.pull_request) {
    const pr = context.payload.pull_request

    core.debug(`PR event detected, head SHA: ${pr.head.sha}`)

    return {
      sha: pr.head.sha,
      message: pr.title,
      authorName: pr.user.login,
      authorEmail: `${pr.user.login}@users.noreply.github.com`,
    }
  }

  // For push events - use commit data from payload
  if (eventName === 'push' && context.payload.head_commit) {
    const commit = context.payload.head_commit

    core.debug(`Push event detected, commit SHA: ${commit.id}`)

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
