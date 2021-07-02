const cherryPick = require('./cherry-pick')

module.exports = async function (context, targetBase) {
  const orig = context.issue
  context.issue = function (...args) {
    const v = orig.call(this, ...args)
    return {...v, pull_number: v.pull_number || v.number, number: undefined}
  }

  const pr = await getPullRequest(context)
  const reviewers = await getReviewers(context)
  reviewers.push(pr.user.login)

  const token = await getToken(context.payload.installation.id)
  const targetBranch = await cherryPick(context, pr, targetBase, token)
  const backport = await createPullRequest(context, pr, targetBase, targetBranch)
  await requestReviewers(context, backport.data.number, reviewers)

  return backport
}

// Obtain token to push to this repo
let cached
const githubAuth = require('github-app')({
  id: process.env.APP_ID,
  cert: process.env.PRIVATE_KEY ?
    process.env.PRIVATE_KEY :
    (process.env.PRIVATE_KEY_FILE && require('fs').readFileSync(process.env.PRIVATE_KEY_FILE))
})

async function getToken (installationId) {
  if (cached && Date.parse(cached.expires_at) > (Date.now() + 1000 * 60)) return cached.token
  const token = await githubAuth.createToken(installationId)
  cached = token.data
  return cached.token
}

async function createPullRequest (context, origPR, targetBase, targetBranch) {
  return context.github.pulls.create(context.repo({
    title: `${origPR.title} [${targetBase}] `,
    head: targetBranch,
    base: targetBase,
    body: patchPullRequestBody(origPR)
  }))
}

async function getPullRequest (context) {
  if (context.payload.pull_request) return context.payload.pull_request
  const pullRequest = await context.github.pulls.get(context.issue())
  return pullRequest.data
}

async function getReviewers (context) {
  const reviewers = await context.github.pulls.listReviews(context.issue())
  const rewiewRequests = await context.github.pulls.listReviewRequests(context.issue())
  const reviewerIds = reviewers.data.map(reviewer => reviewer.user.login)
  const reviewerRequestedIds = rewiewRequests.data.users.map(reviewer => reviewer.login)
  return [...reviewerIds, ...reviewerRequestedIds]
}

async function requestReviewers (context, prId, reviewers) {
  return context.github.pulls.createReviewRequest(context.repo({
    pull_number: prId,
    reviewers: reviewers
  }))
}

function patchPullRequestBody (pr) {
  const body = pr.body || ''
  const msg = `Relations:\n  - Master: #${pr.number}\n`
  if (body.includes('Relations:\n')) return body.replace(/Relations:\n/, msg)
  return `${msg}${body}`
}
