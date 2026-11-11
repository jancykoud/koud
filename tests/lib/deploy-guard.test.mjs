import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeployCommand } from '../../scripts/lib/deploy-guard.mjs';

test('the ordinary deploy commands ask', () => {
  for (const cmd of [
    'vercel deploy',
    'vercel --prod',
    'npx vercel deploy --prebuilt --prod',
    'gcloud run deploy api --source . --region europe-west1',
    'gcloud app deploy',
    'railway up',
    'railway up --service worker --detach',
    'fly deploy',
    'flyctl deploy --remote-only',
    'netlify deploy --prod',
    'firebase deploy --only hosting',
    'terraform apply -auto-approve',
    'cd infra && terraform destroy',
    'kubectl apply -f k8s/',
    'helm upgrade --install api ./chart',
    'eas submit --platform ios',
    'eas update --branch production',
    'pnpm --filter api exec prisma migrate deploy',
  ]) {
    const v = evaluateDeployCommand(cmd);
    assert.ok(v, `should ask: ${cmd}`);
    assert.equal(v.decision, 'ask');
    assert.match(v.reason, /^this command deploys to /);
  }
});

test('local work, previews and help pass through', () => {
  for (const cmd of [
    'vercel build',
    'vercel env pull',
    'vercel deploy --help',
    'vercel logs my-app',
    'gcloud run services list',
    'gcloud auth login',
    'railway status',
    'railway logs',
    'terraform plan',
    'terraform init',
    'kubectl get pods',
    'kubectl apply -f k8s/ --dry-run=client',
    'helm template ./chart',
    'eas build --platform android --profile preview',
    'docker compose up -d',
    'prisma migrate dev',
    'prisma migrate status',
    'npm run deploy:docs',
    'git commit -m "document terraform usage"',
    'grep -rn "vercel" README.md',
    '',
  ]) assert.equal(evaluateDeployCommand(cmd), null, `should pass: ${cmd}`);
  for (const notAString of [undefined, null, 7, {}]) assert.equal(evaluateDeployCommand(notAString), null);
});
