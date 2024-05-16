const {Probot} = require('probot')
const backport = require('./backport')

Probot.run(backportApp)

async function backportApp (app) {
  async function handler (context) {
    const issue = context.payload.issue || context.payload.pull_request
    const comment = context.payload.comment
    if (!issue.html_url.endsWith(`pull/${issue.number}`)) return

    const bodyAndBranches = await matchComments(context, comment.body)
    const {targetBranches} = bodyAndBranches
    if (!targetBranches.length) return

    let {body} = bodyAndBranches
    await updateComment(context, body)

    for (const {arg1: targetBranch} of targetBranches) {
      try {
        await backport(context, targetBranch)
        body = body.replace(`🕑 /backport ${targetBranch}`, `🎉 /backport ${targetBranch}`)
        await updateComment(context, body)
      } catch (err) {
        context.log.warn(`Backport to ${targetBranch} failed`, err)
        body = [
          body.replace(`🕑 /backport ${targetBranch}`, `💥 /backport ${targetBranch}`),
          '',
          `The backport to ${targetBranch} failed.`,
          `Please do this backport manually.`,
          ...(err.pr ? ['```',
            `git fetch origin ${targetBranch}`,
            `git checkout -b backport/${issue.number}/${targetBranch} ${targetBranch}`,
            `git cherry-pick ${err.pr.base.sha}..${err.pr.head.sha}`,
            `git push -u origin backport/${issue.number}/${targetBranch}`,
            '```'
          ] : []),
          '```js',
          err.stack,
          '```'
        ].join('\n')

        await updateComment(context, body)
      }
    }
  }

  app.on('pull_request_review_comment.created', handler)
  app.on('pull_request_review_comment.edited', handler)
  app.on('issue_comment.created', handler)
  app.on('issue_comment.edited', handler)
}

async function updateComment (context, body) {
  const comment = context.payload.comment
  const resource = comment.pull_request_review_id ? context.github.pulls : context.github.issues;
  return resource.updateComment(context.issue({comment_id: comment.id, body}))
}

const staticBackportRegexp = /^ *\/backport ([a-zA-Z0-9\/\-._]+) *([a-zA-Z0-9\/\-._]+)?$/img
const globalBackportRegexp = /^ *\/backport$/img
async function matchComments (context, commentBody) {
  let body = commentBody

  const targetBranches = [...commentBody.matchAll(staticBackportRegexp)]
    .map(([command, arg1, arg2]) => ({command, arg1, arg2}))

  const globalBranches = [...commentBody.matchAll(globalBackportRegexp)]
    .map(([command]) => ({command}))

  if (globalBranches.length) {
    const pullRequest = await backport.getPullRequest(context)
    const backportBranches = (pullRequest.body.match(/Backports?: (.*)/)?.[1]?.split(/[`, ]/).filter(Boolean) || [])
      .map((b) => ({command: `/backport ${b}`, arg1: b}))

    if (backportBranches.length) {
      targetBranches.push(...backportBranches)
      body = body.replace(/^( *\/backport)$/im, backportBranches.map((b) => `🕑 ${b.command}`).join('\n'))
    } else {
      body = body.replace(/^( *\/backport)$/im, `💥 /backport [no branches found in pr body]`)
    }
  }

  body = body.replace(/^ *\/backport(.*)$/img, `🕑 /backport$1`)
  return {body, targetBranches}
}
