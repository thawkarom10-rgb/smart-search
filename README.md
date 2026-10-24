# Smart Search v2

## Deploy to Render

1. In Render, choose **New > Blueprint** and connect this GitHub repository.
2. Select `thawkarom10-rgb/smart-search` and apply the Blueprint from `render.yaml`.
3. Wait for the `smart-search-v2` web service to finish deploying, then open its `onrender.com` URL.

The service runs the Node.js app and Python reliability engine together in Docker. Search works without API keys; optional search-provider keys can be added as environment variables in the Render service settings.

The default Blueprint uses Render's free plan. Search history, suggestions, and cached results are stored in a local JSON file and can be lost when the service restarts or redeploys. Use persistent storage and update the database configuration if that data must survive restarts.