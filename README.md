# iCreat task plugin for models-gateway

A JavaScript task plugin (Task Plugin API v1) that serves [iCreat](https://icreat.ai/hub/docs/integration/overview) image and video models through models-gateway. iCreat has its own task API: `POST /v1/task/submit/<model>` returns a `task_id`, and `POST /v1/task/result` reports status, output URLs and `costUSD`.

## Models

Model names are iCreat's own model codes. That way the plugin never takes over a model that another channel already serves (for example `gpt-image-2` on OpenAI channels).

| Kind | Models |
|---|---|
| Wan 3.0 / 3.0 Prime | `aliyun/wan3-0/{text,image,reference}-to-video`, `aliyun/wan3-0-prime/{text,image,reference}-to-video` |
| Wan 2.7 | `aliyun/wan2-7/{text,image}-to-video` |
| Happy Horse 1.1 | `ali/happyhorse-1-1/{text,image,reference}-to-video` |
| Seedance | `bytedance/seedance-2-0`, `-2-0-fast`, `-2-0-mini`, `bytedance/seedance-2-5` |
| MiniMax | `minimax/h3-video`, `minimax/h3-max` |
| Kling 3.0 | `kwaivgi/kling-v3-0/{text,image}-to-video` |
| Images | `openai/gpt-image-2`, `google/gemini-3-1-flash-image` (Nano Banana 2), `google/gemini-3-pro-image` (Nano Banana Pro), `aliyun/qwen-image-3-0`, `aliyun/qwen-image-3-0-pro`, `bytedance/seedream-5-0` |

The following are left out on purpose:
- **Spicy variants:** uncensored models.
- **Economy variants:** run on unofficial capacity.
- **Kling Omni/O1 and Gemini Omni Flash:** their request formats are more complex, and Higgsfield is cheaper for Kling.

## Client surfaces

- **`POST /v1/videos`** (`openai_video`):
  - `prompt` and `seconds` (or `duration`).
  - `size` (`WxH`): sets the resolution tier and the aspect ratio.
  - `resolution`, `ratio` and `mode` (Kling) override what `size` gives.
  - `image`, `images` or `input_reference` (image URLs) and `negative_prompt`.
  - Seedance only: `metadata.content` passes a full content array, including reference video and audio.
- **`POST /v1/images/generations`** and **`/v1/images/edits`** (`openai_image`):
  - `prompt`, `size`, `quality` (GPT Image), `image` (URL or list of URLs).
  - `aspect_ratio` and `image_size` (Nano Banana), `output_format` (Seedream).
  - `n` must be 1.
- **`POST /v1/responses`** (`openai_responses`, stream/sync/background): the same fields, with the prompt and images taken from `input`.

Rules on media:
- iCreat reads media only from **HTTPS URLs**. Uploaded files are rejected with a clear error.
- Output URLs are presigned and expire **24 hours** after the task finishes.

## Usage facts (pricing inputs)

| Model kind | Facts |
|---|---|
| Video | `seconds`, plus `resolution` (Kling: `mode`) |
| Seedance | also `video_input` (`none` / `video`) |
| Images | `image_count`, plus `resolution` where the model has size tiers |
| GPT Image | also `quality` |
| All | `upstream_cost`: iCreat's `costUSD`, settled when the task completes |

Example expressions:

```
u("resolution") == "1080P" ? tier("1080p", u("seconds") * 0.20) : u("resolution") == "720P" ? tier("720p", u("seconds") * 0.10) : tier("480p", u("seconds") * 0.05)
tier("base", u("image_count") * 0.07)
```

`upstream_cost` lets a price follow iCreat's own charge. Use it for monitoring, or with care for billing:
- It is 0 when the task is submitted, so an expression that uses only `upstream_cost` reserves nothing in advance.
- It is the only fact that captures Seedance charges for reference-video seconds.

## Checks

```bash
./scripts/check.sh            # gateway plugin lint + fixture replay (uses ../models-gateway)
```

`tests/icreat.fixture.json` replays every request shape and the real iCreat responses. The real responses were captured on 2026-10-22 from one GPT Image 2 task and one Wan 3.0 task.

## Adding it to models-gateway

As a built-in plugin:
1. Copy `plugins/tasks/icreat/plugin.js` to `models-gateway/plugins/tasks/icreat/plugin.js`.
2. Add `"icreat"` to `expectedKeys` in `plugins/builtin_plugins_test.go`.
3. Run `go test ./plugins/ ./pkg/jsplugin/`.

Alternatively, upload `plugin.js` from the admin panel's task plugin page.

Then set up the channel:
1. Create a channel of type **Task Plugin (61)** bound to `icreat`.
2. Leave the base URL empty to use `https://api.icreat.ai`, and put the iCreat API key in the channel key.
3. Price each model before enabling the channel.
