// Decision Room — configuration
// aiMode 'demo': AI answers are written in the browser from the app's own facts. Free, no API calls.
// To use real AI (Claude via your Cloudflare Worker), set aiEndpoint to the Worker address, e.g.
//   aiEndpoint: 'https://decision-room-ai.hrishitabhu.workers.dev'
// When aiEndpoint is set, it is used instead of the demo.
window.DR_CONFIG = {
  aiEndpoint: '',
  aiMode: 'demo', cartoKey: ''
};
