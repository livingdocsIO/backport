const {Probot} = require('probot')
const backport = require('./backport')

Probot.run(backportApp)

async function backportApp (app) {
  async function handler (context) {
    const issue = context.payload.issue || context.payload.pull_request
    const comment = context.payload.comment
    if (!issue.html_url.endsWith(`pull/${issue.number}`)) return

    const targetBranches = matchComments(comment.body)
    if (!targetBranches.length) return

    let body = comment.body.replace(/^ *\/backport(.*)$/img, `🕑 /backport$1`)
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

const commandRegexp = /^ *\/backport ([a-zA-Z0-9\/\-._]+) *([a-zA-Z0-9\/\-._]+)?$/img
function matchComments (comment) {
  return [...comment.matchAll(commandRegexp)]
    .map(([command, arg1, arg2]) => ({command, arg1, arg2}))
}
