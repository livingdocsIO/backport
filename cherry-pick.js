const path = require('path')
const tmp = require('os').tmpdir()
const fs = require('fs-extra')
const execFile = require('util').promisify(require('child_process').execFile)

function createGit (dir, context) {
  function exec (file, args = [], options) {
    context.log.debug(file, ...args)
    return execFile(file, args, {cwd: dir, ...options})
  }
  function git (args, options) { return exec('/usr/bin/git', args, options) }
  function child (subdir) { return createGit(path.join(dir, subdir), context) }
  exec.git = git
  exec.child = child
  exec.exec = exec
  exec.path = dir
  return exec
}

async function getWorktree (slug, context, token) {
  const dir = path.join(tmp, 'backport', slug)
  const worktree = createGit(dir, context)
  try {
    await fs.stat(path.join(worktree.path, '.git'))
    await worktree.git(['remote', 'set-url', 'origin', `https://x-access-token:${token}@github.com/${slug}.git`])
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    await fs.mkdir(worktree.path, {recursive: true})
    await worktree.git(['clone', '--bare', `https://x-access-token:${token}@github.com/${slug}.git`, '.git'])
    await worktree.git(['update-ref', '--no-deref', 'HEAD', 'HEAD^{commit}'])
    await fs.appendFile(path.join(worktree.path, '.git/config'), '        fetch = +refs/heads/*:refs/remotes/origin/*')

    // Setup config
    await worktree.git(['config', '--local', 'user.email', 'dev@livingdocs.io'])
    await worktree.git(['config', '--local', 'user.name', 'Machine User'])
    await worktree.git(['config', '--local', 'commit.gpgsign', 'false'])
  }

  return worktree
}

module.exports = async function (context, pr, targetBase, token) {
  const slug = `${context.repo().owner}/${context.repo().repo}`
  const worktree = await getWorktree(slug, context, token)
  const targetBranch = 'backport/' + pr.number + '/' + targetBase
  const targetDir = `${Date.now()}-${targetBranch}`
  const branch = worktree.child(targetDir)

  try {
    // Fetch and create branch
    await worktree.git(['fetch', 'origin', targetBase, pr.head.sha])
    await worktree.git(['branch', targetDir, pr.head.sha])
    await worktree.git(['worktree', 'add', targetDir, targetDir])

    // Rebase the branch onto the new base and push
    await branch.git(['rebase', '--onto', targetBase, pr.base.sha])
    await branch.git(['push', 'origin', `${targetDir}:${targetBranch}`])
    return targetBranch
  } catch (err) {
    throw err
  } finally {
    try {
      await worktree.git(['worktree', 'remove', '--force', targetDir])
    } catch {}
  }
}
