const {Probot} = require('probot')
const backport = require('./backport')

Probot.run(backportApp)

async function backportApp (app) {
  async function handler (context) {
    const issue = context.payload.issue || context.payload.pull_request
    const comment = context.payload.comment
    if (!issue.html_url.endsWith(`pull/${issue.number}`)) return

    await Promise.all(matchComments(comment.body).map(async (targetBranch) => {
      try {
        await updateComment(context, `🕑 ${comment.body}`)
        await backport(context, targetBranch)
        await updateComment(context, `🎉 ${comment.body}`)
      } catch (err) {
        context.log.warn(`Backport to ${targetBranch} failed`, err)
        return updateComment(context, [
          `💥 ${comment.body}`,
          '',
          `The backport to ${targetBranch} failed.`,
          `Please do this backport manually.`,
          '```js',
          err.stack,
          '```'
        ].join('\n'))
      }
    }))
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
}
