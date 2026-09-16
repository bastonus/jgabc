/**
 * review_relay_worker.mjs — Relais Serverless Direct (Cloudflare Worker) pour Oremus
 * 
 * Ce script permet aux utilisateurs de l'application Android (APK) ou Web de transmettre
 * leurs avis de validation grégorienne en 1 clic SANS AUCUNE ISSUE GITHUB, sans compte
 * et sans aucune intervention sur navigateur.
 * 
 * MODES DE TRANSMISSION :
 * 1. Mode Direct (Défaut - ZÉRO ISSUE) :
 *    Enregistre et committe directement chaque avis dans `pipeline/reviews/pending/` sur la branche master
 *    via l'API GitHub Contents. Aucun ticket n'est ouvert, aucun navigateur ne s'ouvre.
 * 2. Mode Issue (Optionnel si CREATE_ISSUES='true') :
 *    Ouvre un ticket avec label `lab-review` pour ingestion par stage_reviews.yml.
 * 
 * DÉPLOIEMENT EN 60 SECONDES SUR CLOUDFLARE WORKERS (100% GRATUIT) :
 * 1. Rendez-vous sur https://dash.cloudflare.com/ -> Workers & Pages -> Create Application.
 * 2. Collez le code de ce fichier.
 * 3. Dans Settings -> Variables and Secrets, ajoutez un Secret :
 *    - Nom : GITHUB_TOKEN
 *    - Valeur : Votre Personal Access Token GitHub (Classic avec droit 'repo' ou Fine-Grained avec 'Contents: Read and write')
 * 4. Déployez ! L'URL générée (ex: https://oremus-reviews.votre-nom.workers.dev) peut être configurée
 *    dans l'application via `localStorage.setItem('oremus_review_relay_url', 'https://...');`
 *    ou définie par défaut comme `window.OREMUS_REVIEW_RELAY_URL`.
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'oremus-review-relay',
        mode: env.CREATE_ISSUES === 'true' ? 'github_issues' : 'direct_git_commit'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/api/review') {
      return new Response(JSON.stringify({ error: 'Not Found. Use POST /api/review' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const data = await request.json();
      const reviews = data.reviews || {};
      const count = data.count || Object.keys(reviews).length;
      const client = data.client || 'android_apk';

      if (count === 0 || Object.keys(reviews).length === 0) {
        return new Response(JSON.stringify({ error: 'Aucun avis fourni.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const ghToken = env.GITHUB_TOKEN;
      if (!ghToken) {
        return new Response(JSON.stringify({ error: 'GITHUB_TOKEN non configure dans le Worker.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const repoOwner = env.GITHUB_OWNER || 'bastonus';
      const repoName = env.GITHUB_REPO || 'jgabc';
      const nowIso = new Date().toISOString();
      const timeStamp = Date.now();

      // OPTION A : Mode Issue (uniquement si explicitement demandé)
      if (env.CREATE_ISSUES === 'true') {
        const title = data.title || `[Validation Gregorienne] ${count} chants verifies (${client})`;
        const jsonBlock = JSON.stringify(reviews, null, 2);
        const body = data.body || `### Soumission de validations gregoriennes (${count} pieces)\n\nClient : \`${client}\`\nDate : ${nowIso}\n\n\`\`\`json\n${jsonBlock}\n\`\`\`\n\n*Transmis automatiquement via le relais serverless Oremus.*`;

        const ghRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Oremus-Review-Relay/1.0',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: title,
            body: body,
            labels: ['lab-review']
          })
        });

        if (!ghRes.ok) {
          const ghErr = await ghRes.text();
          return new Response(JSON.stringify({ error: 'Erreur API GitHub (Issues)', detail: ghErr }), {
            status: ghRes.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const issueData = await ghRes.json();
        return new Response(JSON.stringify({
          ok: true,
          mode: 'github_issue',
          issue_number: issueData.number,
          issue_url: issueData.html_url
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // OPTION B : Mode Direct Git Commit (DÉFAUT - ZÉRO ISSUE GITHUB)
      // Commit direct de chaque avis dans pipeline/reviews/pending/
      const results = [];
      for (const [pieceId, rev] of Object.entries(reviews)) {
        const safeId = String(pieceId).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const filePath = `pipeline/reviews/pending/${safeId}__apk_${timeStamp}.json`;

        const reviewDoc = {
          piece_id: String(pieceId),
          status: rev.status,
          comment: rev.comment || '',
          reviewedAt: rev.reviewedAt || nowIso,
          stagedAt: nowIso,
          author: `mobile_${client}`,
          source: 'direct_relay_worker',
          title: rev.title || '',
          incipit: rev.incipit || '',
          youtube_id: rev.youtube_id || ''
        };

        const jsonStr = JSON.stringify(reviewDoc, null, 2);
        // Base64 encode for GitHub contents API
        const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));

        const putRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Oremus-Review-Relay/1.0',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `chore(reviews): stage piece ${safeId} from APK [direct zero-issue push]`,
            content: base64Content,
            branch: 'master'
          })
        });

        if (putRes.ok) {
          results.push({ piece_id: pieceId, status: 'staged', file: filePath });
        } else {
          const errText = await putRes.text();
          console.warn(`Failed to commit piece ${pieceId}:`, errText);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        mode: 'direct_commit_zero_issue',
        staged_count: results.length,
        total_requested: count,
        results: results
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Exception interne', detail: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
