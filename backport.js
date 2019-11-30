const cherryPick = require('./cherry-pick')

module.exports = async function (context, targetBase) {
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
  return context.github.pullRequests.create(context.repo({
    title: `${origPR.title} [${targetBase}] `,
    head: targetBranch,
    base: targetBase,
    body: `Backport of #${origPR.number}\n\n${origPR.body}`
  }))
}

async function getPullRequest (context) {
  if (context.payload.pull_request) return context.payload.pull_request
  const pullRequest = await context.github.pullRequests.get(context.issue())
  return pullRequest.data
}

async function getReviewers (context) {
  const reviewers = await context.github.pullRequests.listReviews(context.issue())
  const rewiewRequests = await context.github.pullRequests.listReviewRequests(context.issue())
  const reviewerIds = reviewers.data.map(reviewer => reviewer.user.login)
  const reviewerRequestedIds = rewiewRequests.data.users.map(reviewer => reviewer.login)
  return [...reviewerIds, ...reviewerRequestedIds]
}

async function requestReviewers (context, prId, reviewers) {
  return context.github.pullRequests.createReviewRequest(context.repo({
    number: prId,
    reviewers: reviewers
  }))
}
