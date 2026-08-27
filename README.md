# Smart Retail Display & Shelf

An MVP digital-signage application for retail TVs. It consumes an advertising JSON contract, plays eligible image/video campaigns with a Paystack payment QR code, and switches to YouTube entertainment between advertising cycles.

Spark/Zuke will eventually provide the advertising data and business logic. This repository focuses on validating and displaying that data reliably.

## Features

- Active, paid advertisement filtering
- Image and muted video playback
- Paystack QR code overlay for every eligible advert
- Configurable advertising and YouTube durations
- `play_count` campaign frequency control
- Five-minute maximum advertising section
- Safe handling of empty, malformed, unpaid, inactive, and broken media
- FastAPI endpoint for serving validated media data
- Optional mock/real GPIO and Paystack webhook prototype retained separately

## Project structure

```text
frontend/            TV signage UI (HTML, CSS, Vanilla JavaScript)
  media.json         Development media contract
backend/app/         FastAPI media API and services
hardware/            Optional mock/real GPIO controllers
kiosk/               Raspberry Pi Chromium kiosk examples
tests/               Backend and GPIO tests
```

## Requirements

- Python 3.10 or newer
- Internet access for remote media, YouTube, and the client-side QR library

## Run locally

```powershell
cd C:\Users\Amanda\Smart-Retail-Display
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
uvicorn backend.app.main:app --reload
```

Open the display at http://127.0.0.1:8000.

Useful endpoints:

- `GET /api/media` — validated display configuration and eligible advertisements
- `/docs` — FastAPI interactive API documentation
- `POST /api/paystack/webhook` — retained payment/GPIO prototype endpoint

## Advertising data contract

The display reads one JSON object from `frontend/media.json` (or ultimately from Spark/Zuke):

```json
{
  "media": [
    {
      "id": "media_001",
      "business_id": "business_001",
      "business_name": "Amanda Cosmetics",
      "type": "product",
      "name": "Premium Lipstick Collection",
      "media_type": "image",
      "media_url": "https://cdn.example.com/lipstick.jpg",
      "paystack_url": "https://paystack.com/pay/lipstick-001",
      "payment_status": "paid",
      "play_count": 2,
      "status": "active",
      "orientation": "landscape"
    }
  ],
  "youtube_playlist_id": "YOUR_PLAYLIST_ID",
  "ad_duration_seconds": 30,
  "youtube_duration_minutes": 10
}
```

### Field rules

All media fields shown above are required except `orientation`.

| Field | Rule |
| --- | --- |
| `media_type` | `image` or `video` |
| `media_url`, `paystack_url` | Valid HTTP(S) URLs |
| `status` | Must be `active` to display |
| `payment_status` | Must be `paid` to display |
| `play_count` | Positive whole number |
| `orientation` | Optional: `landscape`, `portrait`, or `square` |

`orientation` describes the intended aspect ratio of an image or video. When omitted, existing media remains valid and keeps the original display behaviour. Landscape keeps the default cropped fill; portrait and square use a contained fit to avoid cropping. If supplied with any other value, that advert is ignored without stopping the display cycle.

The backend and frontend ignore invalid entries individually. They use safe defaults of 30 seconds for advertisements and 10 minutes for YouTube if global durations are invalid. See [the API and data-contract documentation](docs/API.md) for the complete field reference, development API behaviour, error handling, and Spark/Zuke integration TBDs.

## Playback flow

1. Load and validate the JSON configuration.
2. Filter to complete, active, paid campaigns.
3. Expand each advert according to `play_count`.
4. Limit the expanded advertising playlist to five minutes.
5. Play each image/video for `ad_duration_seconds` and generate a QR code encoding exactly its `paystack_url`.
6. Play the configured YouTube playlist for `youtube_duration_minutes`.
7. Reload the media configuration and repeat.

`play_count` is deliberately used instead of advertising slots: it is simple, explicit, and easy for Spark/Zuke to generate without introducing an auction or scheduling system.

## Tests

With the virtual environment active:

```powershell
pytest
```

The suite covers media filtering/configuration fallback, webhook signature validation, product-to-pin mapping, and mock GPIO behavior. Browser timing, QR rendering, remote media availability, YouTube playback, and physical Raspberry Pi hardware must be verified in their target environments.

## Environment and hardware note

Keep `GPIO_MODE=mock` on a normal computer. The physical GPIO and Paystack webhook paths are retained from the earlier shelf prototype but are not required for the current display MVP. Do not commit `.env` or place secrets in `media.json`.
## Deployment

### Deploying to Render

This project is ready to be deployed to [Render](https://render.com/).

#### Option 1: Using the Render Blueprint (Easiest)

1. Fork this repository to your GitHub account.
2. Log in to Render and click **New** > **Blueprint**.
3. Connect your fork.
4. Render will automatically detect the `render.yaml` file and configure the service.
5. Set your `PAYSTACK_SECRET_KEY` in the Render dashboard environment variables.

#### Option 2: Manual Deployment

1. Create a new **Web Service** on Render.
2. Connect your repository.
3. Select **Docker** as the runtime.
4. Render will use the included `Dockerfile`.
5. Add the following environment variables:
   - `GPIO_MODE`: `mock`
   - `UNLOCK_DURATION_SECONDS`: `5`
   - `PAYSTACK_SECRET_KEY`: Your secret key from Paystack.

The application will be available at your Render URL (e.g., `https://smart-retail-display.onrender.com`).

### Deploying to Vercel

1. Fork/Push this repository to GitHub.
2. Connect the project to Vercel.
3. Vercel will use `vercel.json` to route `/api` to the Python serverless function and serve the `frontend` statically.
4. Add `PAYSTACK_SECRET_KEY` and `GPIO_MODE=mock` to your Vercel Environment Variables.


### Manual Docker Deployment

If you want to run the container locally or on another cloud provider:

```bash
docker build -t smart-retail-display .
docker run -p 8000:8000 -e GPIO_MODE=mock smart-retail-display
```

### Deploying to Vercel

The included `vercel.json` deploys the FastAPI application as a Python
serverless function, including the signage frontend served at `/`.

1. Import the repository into Vercel with the **Root Directory** set to the
   repository root.
2. Leave the framework preset as **Other** and do not set an output directory.
3. Add `PAYSTACK_SECRET_KEY` only if you will use the payment webhook. Set
   `GPIO_MODE` to `mock` (the default) for Vercel.
4. Redeploy the project after pushing these files.

Vercel serverless functions are intended for the display API and web UI. The
physical GPIO controller is not available in that environment.

