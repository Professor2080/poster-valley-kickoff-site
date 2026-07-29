import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const expectedNodeVersion = '24.18.0'
export const expectedNpmVersion = '11.16.0'

export function validateToolVersions({
  nodeVersion,
  npmVersion,
  expectedNode = expectedNodeVersion,
  expectedNpm = expectedNpmVersion,
}) {
  const issues = []
  if (nodeVersion !== expectedNode) {
    issues.push(`Node version must be ${expectedNode}; found ${nodeVersion}.`)
  }
  if (npmVersion !== expectedNpm) {
    issues.push(`npm version must be ${expectedNpm}; found ${npmVersion}.`)
  }
  return issues
}

export function run() {
  const userAgentVersion = process.env.npm_config_user_agent?.match(
    /(?:^|\s)npm\/([^\s]+)/,
  )?.[1]
  let npmVersion = userAgentVersion
  if (!npmVersion && process.env.npm_execpath) {
    npmVersion = execFileSync(
      process.execPath,
      [process.env.npm_execpath, '--version'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
  }
  if (!npmVersion) {
    npmVersion = execFileSync(
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm.cmd --version']
        : ['--version'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
  }
  const issues = validateToolVersions({
    nodeVersion: process.versions.node,
    npmVersion,
  })
  if (issues.length) {
    issues.forEach((issue) => console.error(`FAIL ${issue}`))
    return false
  }
  console.log(
    `PASS tool versions (Node ${process.versions.node}, npm ${npmVersion}).`,
  )
  return true
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  try {
    if (!run()) process.exitCode = 1
  } catch (error) {
    console.error(`FAIL tool-version check: ${error.message}`)
    process.exitCode = 1
  }
}
