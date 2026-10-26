// Point d'entrée Cloudflare Workers (nodejs_compat) : le même serveur Express que `node dist/server.js`.
// server.ts appelle app.listen(PORT) ; httpServerHandler route les requêtes du Worker vers ce port.
// Les fichiers statiques du frontend sont servis par le binding assets (wrangler.jsonc) ;
// seuls /api/* et /health atteignent ce code.
import { httpServerHandler } from 'cloudflare:node'
import './server'

export default httpServerHandler({ port: Number(process.env.PORT ?? 4000) })
