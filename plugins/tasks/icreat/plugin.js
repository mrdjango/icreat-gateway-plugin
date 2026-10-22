// iCreat (https://icreat.ai) image and video models through its unified task
// API: POST /v1/task/submit/<model> answers {task_id}; POST /v1/task/result
// answers {status, result[], costUSD}. Model names are iCreat's own model
// codes, so the plugin never claims a model another channel already serves.
//
// Capabilities below come from the iCreat model docs (checked 2026-10-22), not
// prices. Spicy (uncensored) and Economy (unofficial capacity) variants are
// left out on purpose. iCreat reads media only from HTTPS URLs.

// family: request body shape. media: role a reference image takes (null when
// the model takes none). maxMedia: reference images accepted.
const VIDEO_MODELS = {
  "aliyun/wan3-0/text-to-video": { family: "wan", resolutions: ["480P", "720P", "1080P"], minDuration: 4, maxDuration: 30, media: null },
  "aliyun/wan3-0/image-to-video": { family: "wan", resolutions: ["480P", "720P", "1080P"], minDuration: 4, maxDuration: 30, media: "reference_image", maxMedia: 1 },
  "aliyun/wan3-0/reference-to-video": { family: "wan", resolutions: ["480P", "720P", "1080P"], minDuration: 4, maxDuration: 30, media: "reference_image", maxMedia: 9 },
  "aliyun/wan3-0-prime/text-to-video": { family: "wan", resolutions: ["480P", "720P", "1080P"], minDuration: 4, maxDuration: 30, media: null },
  "aliyun/wan3-0-prime/image-to-video": { family: "wan", resolutions: ["480P", "720P", "1080P"], minDuration: 4, maxDuration: 30, media: "reference_image", maxMedia: 1 },
  "aliyun/wan3-0-prime/reference-to-video": { family: "wan", resolutions: ["480P", "720P", "1080P"], minDuration: 4, maxDuration: 30, media: "reference_image", maxMedia: 9 },
  "aliyun/wan2-7/text-to-video": { family: "wan", resolutions: ["720P", "1080P"], minDuration: 4, maxDuration: 15, media: null },
  "aliyun/wan2-7/image-to-video": { family: "wan", resolutions: ["720P", "1080P"], minDuration: 4, maxDuration: 15, media: "first_frame", maxMedia: 1 },
  "ali/happyhorse-1-1/text-to-video": { family: "wan", resolutions: ["720P", "1080P"], minDuration: 4, maxDuration: 15, media: null },
  "ali/happyhorse-1-1/image-to-video": { family: "wan", resolutions: ["720P", "1080P"], minDuration: 4, maxDuration: 15, media: "first_frame", maxMedia: 1 },
  "ali/happyhorse-1-1/reference-to-video": { family: "wan", resolutions: ["720P", "1080P"], minDuration: 4, maxDuration: 15, media: "reference_image", maxMedia: 9 },
  "bytedance/seedance-2-0": { family: "seedance", resolutions: ["480p", "720p", "1080p", "4k"], minDuration: 4, maxDuration: 15, maxMedia: 9 },
  "bytedance/seedance-2-0-fast": { family: "seedance", resolutions: ["480p", "720p"], minDuration: 4, maxDuration: 15, maxMedia: 9 },
  "bytedance/seedance-2-0-mini": { family: "seedance", resolutions: ["480p", "720p"], minDuration: 4, maxDuration: 15, maxMedia: 9 },
  "bytedance/seedance-2-5": { family: "seedance", resolutions: ["480p", "720p"], minDuration: 4, maxDuration: 30, maxMedia: 30 },
  "minimax/h3-video": { family: "minimax", resolutions: ["768P", "2K"], minDuration: 4, maxDuration: 15, media: "reference_image", maxMedia: 9 },
  // H3 Max takes a first frame and an optional last frame, and rejects
  // `adaptive` for text-to-video.
  "minimax/h3-max": { family: "minimax", resolutions: ["480P", "768P"], minDuration: 4, maxDuration: 15, media: "frames", maxMedia: 2 },
  "kwaivgi/kling-v3-0/text-to-video": { family: "kling", modes: ["std", "pro", "4k"], minDuration: 4, maxDuration: 15, media: null },
  "kwaivgi/kling-v3-0/image-to-video": { family: "kling", modes: ["std", "pro", "4k"], minDuration: 4, maxDuration: 15, media: "image", maxMedia: 1 },
};

const RATIOS = {
  wan: ["1:1", "9:16", "16:9", "3:4", "4:3"],
  seedance: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
  minimax: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
};

// sizes: accepted output size tiers (null when the model takes WxH sizes only).
const IMAGE_MODELS = {
  "openai/gpt-image-2": { family: "gpt", sizes: ["1K", "2K", "4K"], maxMedia: 10 },
  "google/gemini-3-1-flash-image": { family: "gemini", sizes: ["1K", "2K", "4K"], maxMedia: 11 },
  "google/gemini-3-pro-image": { family: "gemini", sizes: ["1K", "2K", "4K"], maxMedia: 11 },
  "aliyun/qwen-image-3-0": { family: "qwen", sizes: null, maxMedia: 1 },
  "aliyun/qwen-image-3-0-pro": { family: "qwen", sizes: null, maxMedia: 1 },
  "bytedance/seedream-5-0": { family: "seedream", sizes: ["2K", "4K"], maxMedia: 5 },
};

const GPT_QUALITIES = ["low", "medium", "high"];
const GEMINI_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
// Every iCreat image task returns one image; bounds the completion count.
const MAX_OUTPUT_IMAGES = 4;
// costUSD is upstream-controlled; anything outside this range keeps the reservation.
const MAX_UPSTREAM_COST = 1000;

const IMAGE_UNIT_LABEL = { en: "image", zh: "张", "zh-TW": "張", fr: "image", ja: "枚", ru: "изображение", vi: "ảnh" };
// iCreat reports its charge as costUSD on success. Priced as a credit so an
// expression can follow the upstream cost, which covers charges the request
// cannot predict (Seedance bills reference video seconds too).
const UPSTREAM_COST_FIELD = {
  type: "number",
  unit: "credit",
  description: { en: "iCreat cost credit unit price", zh: "iCreat 成本额度单价" },
};

function enumField(values, en, zh) {
  const labels = {};
  for (const value of values) labels[value] = { en: value, zh: value };
  return { enum: values, enumLabels: labels, description: { en: en, zh: zh } };
}

function videoUsageSchema(profile) {
  const schema = { seconds: { type: "number", unit: "second", description: { en: "Video generation unit price", zh: "视频生成单价" } } };
  if (profile.family === "kling") schema.mode = enumField(profile.modes, "Output video mode", "输出视频模式");
  else schema.resolution = enumField(profile.resolutions, "Output video resolution", "输出视频分辨率");
  if (profile.family === "seedance") {
    schema.video_input = {
      enum: ["none", "video"],
      enumLabels: { none: { en: "No reference video", zh: "无参考视频" }, video: { en: "With reference video", zh: "有参考视频" } },
      description: { en: "Reference video input", zh: "参考视频输入" },
    };
  }
  schema.upstream_cost = UPSTREAM_COST_FIELD;
  return schema;
}

function videoUsageExamples(profile) {
  const tiers = profile.family === "kling" ? profile.modes : profile.resolutions;
  return tiers.map((tier) => {
    const facts = { seconds: 5, upstream_cost: 0 };
    if (profile.family === "kling") facts.mode = tier;
    else facts.resolution = tier;
    if (profile.family === "seedance") facts.video_input = "none";
    return { label: tier + " · 5s", facts: facts };
  });
}

function imageUsageSchema(profile) {
  const schema = { image_count: { type: "number", unit: "count", unitLabel: IMAGE_UNIT_LABEL, description: { en: "Image generation unit price", zh: "图片生成单价" } } };
  if (profile.sizes) schema.resolution = enumField(profile.sizes, "Output image resolution", "输出图片分辨率");
  if (profile.family === "gpt") schema.quality = enumField(GPT_QUALITIES, "Output image quality", "输出图片质量");
  schema.upstream_cost = UPSTREAM_COST_FIELD;
  return schema;
}

function imageUsageExamples(profile) {
  const sizes = profile.sizes || ["1K"];
  return sizes.map((size) => {
    const facts = { image_count: 1, upstream_cost: 0 };
    if (profile.sizes) facts.resolution = size;
    if (profile.family === "gpt") facts.quality = "medium";
    return { label: (profile.sizes ? size : "1024*1024") + " · 1 image", facts: facts };
  });
}

// Models whose schema and examples match share one usage profile.
function usageProfiles(models, schemaOf, examplesOf) {
  const profiles = [];
  for (const model of Object.keys(models)) {
    const schema = schemaOf(models[model]);
    const examples = examplesOf(models[model]);
    const shape = JSON.stringify([schema, examples]);
    let profile = profiles.find((entry) => entry.shape === shape);
    if (!profile) {
      profile = { shape: shape, models: [], schema: schema, examples: examples };
      profiles.push(profile);
    }
    profile.models.push(model);
  }
  return profiles.map((profile) => ({ models: profile.models, schema: profile.schema, examples: profile.examples }));
}

export const meta = {
  apiVersion: 1,
  key: "icreat",
  name: "iCreat",
  icon: "text:iC",
  description: {
    en: "iCreat image and video generation (Wan, Happy Horse, Seedance, MiniMax H3, Kling, GPT Image, Nano Banana, Qwen Image, Seedream)",
    zh: "iCreat 图片与视频生成（万相、Happy Horse、Seedance、MiniMax H3、可灵、GPT Image、Nano Banana、通义图像、Seedream）",
  },
  version: "1.0.1",
  author: { name: "TensorGrid" },
  website: "https://icreat.ai/hub/docs/integration/overview",
  baseUrl: "https://api.icreat.ai",
  models: Object.keys(VIDEO_MODELS).concat(Object.keys(IMAGE_MODELS)),
  fetchMode: "per_task",
  usageSchema: videoUsageSchema(VIDEO_MODELS["aliyun/wan3-0/text-to-video"]),
  usageExamples: videoUsageExamples(VIDEO_MODELS["aliyun/wan3-0/text-to-video"]),
  usageProfiles: usageProfiles(VIDEO_MODELS, videoUsageSchema, videoUsageExamples).concat(usageProfiles(IMAGE_MODELS, imageUsageSchema, imageUsageExamples)),
  protocols: [
    { name: "openai_responses", supports: ["stream", "sync", "background"] },
    { name: "openai_video", models: Object.keys(VIDEO_MODELS) },
    { name: "openai_image", models: Object.keys(IMAGE_MODELS) },
  ],
};

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function plainObject(value, name) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(name + " must be an object");
  return value;
}

// The executing iCreat model: channel mapping may point a declared model at
// another iCreat code, which then decides the body and the usage facts.
function modelOf(ctx) {
  for (const model of [ctx && ctx.upstreamModel, ctx && ctx.model].map(trimmed)) {
    if (has(VIDEO_MODELS, model) || has(IMAGE_MODELS, model)) return model;
  }
  throw new Error("model is not served by the iCreat plugin");
}

function isImageModel(ctx) {
  return has(IMAGE_MODELS, modelOf(ctx));
}

function mediaURLs(values, limit) {
  const urls = [];
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const url = trimmed(value);
    if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error("iCreat reads reference media only from HTTPS URLs");
    if (!urls.includes(url)) urls.push(url);
  }
  if (limit !== undefined && urls.length > limit) throw new Error("at most " + limit + " reference images are supported");
  return urls;
}

function listOf(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function sizeDims(value) {
  const match = /^(\d+)\s*[xX×*]\s*(\d+)$/.exec(trimmed(value));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return null;
  return { width: width, height: height };
}

// Closest supported aspect ratio to a WxH size.
function nearestRatio(dims, ratios) {
  const target = dims.width / dims.height;
  let best = "";
  let bestDistance = Infinity;
  for (const ratio of ratios) {
    const parts = ratio.split(":");
    if (parts.length !== 2) continue;
    const distance = Math.abs(Math.log(Number(parts[0]) / Number(parts[1]) / target));
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
}

function pickOption(value, options, name) {
  const wanted = trimmed(value).toLowerCase();
  const match = options.find((option) => option.toLowerCase() === wanted);
  if (!match) throw new Error(name + " must be one of " + options.join(", "));
  return match;
}

// Output resolution tier of a WxH size: the smallest tier whose long edge covers it.
function videoTierFromSize(dims, resolutions) {
  const longEdge = { "480p": 854, "720p": 1280, "768p": 1366, "1080p": 1920, "2k": 2560, "4k": 3840 };
  const edge = Math.max(dims.width, dims.height);
  for (const tier of resolutions) {
    if (edge <= longEdge[tier.toLowerCase()]) return tier;
  }
  return resolutions[resolutions.length - 1];
}

// Normalized video request: the iCreat body plus the usage facts it is billed
// on. buildSubmitRequest and extractUsage both read this, so the facts always
// describe exactly what is sent.
function videoRequest(ctx) {
  const model = modelOf(ctx);
  const profile = VIDEO_MODELS[model];
  if (!profile) throw new Error(model + " is an image model");
  const req = (ctx && ctx.requestBody) || {};
  const metadata = plainObject(req.metadata, "metadata");
  const pick = (key) => (has(metadata, key) ? metadata[key] : req[key]);
  const prompt = trimmed(req.prompt);

  let seconds = pick("duration");
  if (seconds === undefined) seconds = req.seconds;
  if (seconds === undefined || seconds === null || seconds === "") seconds = Math.max(profile.minDuration, Math.min(5, profile.maxDuration));
  seconds = Number(seconds);
  if (!Number.isInteger(seconds) || seconds < profile.minDuration || seconds > profile.maxDuration)
    throw new Error("seconds must be an integer between " + profile.minDuration + " and " + profile.maxDuration);

  const dims = sizeDims(req.size);
  const images = mediaURLs(listOf(req.images).concat(listOf(req.image), listOf(req.input_reference)), profile.maxMedia);
  const facts = { seconds: seconds, upstream_cost: 0 };
  let body;
  let hasImage = images.length > 0;

  if (profile.family === "kling") {
    const mode = pick("mode") === undefined ? "std" : pickOption(pick("mode"), profile.modes, "mode");
    if (!prompt) throw new Error("prompt is required");
    if (profile.media === null && hasImage) throw new Error(model + " does not take images; use kwaivgi/kling-v3-0/image-to-video");
    if (profile.media !== null && !hasImage) throw new Error(model + " requires an image");
    body = { prompt: prompt, mode: mode, duration: seconds };
    if (hasImage) body.image = images[0];
    facts.mode = mode;
    return { body: body, facts: facts, action: hasImage ? "image_to_video" : "text_to_video" };
  }

  let resolution = pick("resolution");
  if (resolution !== undefined) resolution = pickOption(resolution, profile.resolutions, "resolution");
  else if (dims) resolution = videoTierFromSize(dims, profile.resolutions);
  else resolution = profile.resolutions.find((tier) => ["720p", "768p"].includes(tier.toLowerCase())) || profile.resolutions[0];
  facts.resolution = resolution;

  const ratios = RATIOS[profile.family];
  let ratio = pick("ratio");
  if (ratio !== undefined) ratio = pickOption(ratio, ratios, "ratio");
  else if (dims) ratio = nearestRatio(dims, ratios.filter((value) => value !== "adaptive"));
  else ratio = hasImage && ratios.includes("adaptive") ? "adaptive" : "16:9";

  if (profile.family === "wan") {
    if (!prompt) throw new Error("prompt is required");
    if (profile.media === null && hasImage) throw new Error(model + " does not take images; use the image-to-video or reference-to-video model");
    if (profile.media !== null && !hasImage) throw new Error(model + " requires a reference image");
    const input = { prompt: prompt };
    if (trimmed(pick("negative_prompt"))) input.negative_prompt = trimmed(pick("negative_prompt"));
    if (hasImage) input.media = images.map((url) => ({ type: profile.media, url: url }));
    body = { input: input, parameters: { resolution: resolution, ratio: ratio, duration: seconds, watermark: pick("watermark") === true } };
    return { body: body, facts: facts, action: hasImage ? "image_to_video" : "text_to_video" };
  }

  if (profile.family === "seedance") {
    // metadata.content passes a full Seedance content array (video, audio and
    // role-tagged references); otherwise one image is the first frame and
    // several are references.
    let content;
    if (metadata.content !== undefined) {
      if (!Array.isArray(metadata.content) || !metadata.content.length) throw new Error("metadata.content must be a non-empty array");
      content = metadata.content;
      for (const item of content) {
        const part = plainObject(item, "metadata.content item");
        const key = { image_url: "image_url", video_url: "video_url", audio_url: "audio_url" }[part.type];
        if (key) mediaURLs([plainObject(part[key], key).url], 1);
        else if (part.type !== "text") throw new Error("metadata.content type must be text, image_url, video_url or audio_url");
      }
    } else {
      if (!prompt && !hasImage) throw new Error("prompt is required");
      content = [];
      if (prompt) content.push({ type: "text", text: prompt });
      const role = images.length === 1 ? "first_frame" : "reference_image";
      for (const url of images) content.push({ type: "image_url", image_url: { url: url }, role: role });
    }
    hasImage = content.some((item) => item.type !== "text");
    body = { content: content, resolution: resolution, ratio: ratio, duration: seconds, watermark: pick("watermark") === true };
    if (typeof pick("generate_audio") === "boolean") body.generate_audio = pick("generate_audio");
    if (Array.isArray(metadata.tools)) body.tools = metadata.tools;
    facts.video_input = content.some((item) => item.type === "video_url") ? "video" : "none";
    return { body: body, facts: facts, action: hasImage ? "image_to_video" : "text_to_video" };
  }

  // MiniMax H3 / H3 Max.
  if (!prompt) throw new Error("prompt is required");
  const content = [{ type: "text", text: prompt }];
  images.forEach((url, index) => {
    const role = profile.media === "frames" ? (index === 0 ? "first_frame" : "last_frame") : "reference_image";
    content.push({ type: "image_url", image_url: { url: url }, role: role });
  });
  if (profile.media === "frames" && !hasImage && ratio === "adaptive") throw new Error("ratio adaptive needs a first frame image");
  body = { model: model, content: content, resolution: resolution, duration: seconds, ratio: ratio, aigc_watermark: pick("watermark") === true };
  return { body: body, facts: facts, action: hasImage ? "image_to_video" : "text_to_video" };
}

// Image tier of a WxH size by pixel area, matching iCreat's 1K/2K/4K size groups.
function imageTierFromPixels(dims) {
  const pixels = dims.width * dims.height;
  if (pixels <= 1310720) return "1K";
  if (pixels <= 4194304) return "2K";
  if (pixels <= 8294400) return "4K";
  throw new Error("size exceeds the 4K output limit");
}

function imageRequest(ctx) {
  const model = modelOf(ctx);
  const profile = IMAGE_MODELS[model];
  if (!profile) throw new Error(model + " is a video model");
  const req = (ctx && ctx.requestBody) || {};
  const prompt = trimmed(req.prompt);
  if (!prompt) throw new Error("prompt is required");
  const images = mediaURLs(listOf(req.image), profile.maxMedia);
  const dims = sizeDims(req.size);
  const preset = trimmed(req.size).toUpperCase();
  const facts = { image_count: 1, upstream_cost: 0 };
  let body;

  if (profile.family === "gpt") {
    const size = dims ? dims.width + "x" + dims.height : req.size === undefined ? "1024x1024" : "";
    if (!size) throw new Error("size must be width x height pixels, for example 1024x1024");
    const quality = req.quality === undefined ? "medium" : pickOption(req.quality, GPT_QUALITIES, "quality");
    facts.resolution = imageTierFromPixels(sizeDims(size));
    facts.quality = quality;
    body = { prompt: prompt, size: size, quality: quality };
  } else if (profile.family === "gemini") {
    let imageSize = req.image_size;
    if (imageSize !== undefined) imageSize = pickOption(imageSize, profile.sizes, "image_size");
    else if (profile.sizes.includes(preset)) imageSize = preset;
    else if (dims) imageSize = Math.max(dims.width, dims.height) <= 1536 ? "1K" : Math.max(dims.width, dims.height) <= 3072 ? "2K" : "4K";
    else if (req.size === undefined) imageSize = "1K";
    else throw new Error("size must be 1K, 2K, 4K or width x height pixels");
    let ratio = req.aspect_ratio;
    if (ratio !== undefined) ratio = pickOption(ratio, GEMINI_RATIOS, "aspect_ratio");
    else ratio = dims ? nearestRatio(dims, GEMINI_RATIOS) : "1:1";
    facts.resolution = imageSize;
    body = { prompt: prompt, aspect_ratio: ratio, image_size: imageSize };
  } else if (profile.family === "seedream") {
    let size;
    if (profile.sizes.includes(preset)) size = preset;
    else if (dims) size = dims.width * dims.height <= 4194304 ? "2K" : "4K";
    else if (req.size === undefined) size = "2K";
    else throw new Error("size must be 2K, 4K or width x height pixels");
    const format = trimmed(req.output_format || req.outputFormat || "png").toLowerCase();
    if (!["png", "jpg", "jpeg"].includes(format)) throw new Error("output_format must be png or jpg");
    facts.resolution = size;
    body = { prompt: prompt, size: size, outputFormat: format === "jpeg" ? "jpg" : format, watermark: req.watermark === true };
  } else {
    // Qwen Image: DashScope messages with WxH written as W*H.
    const size = dims ? dims.width + "*" + dims.height : req.size === undefined ? "1024*1024" : "";
    if (!size) throw new Error("size must be width x height pixels, for example 1024x1024");
    const content = [{ text: prompt }].concat(images.map((url) => ({ image: url })));
    return {
      body: { input: { messages: [{ role: "user", content: content }] }, parameters: { size: size, watermark: req.watermark === true } },
      facts: facts,
      action: images.length ? "image_to_image" : "text_to_image",
    };
  }
  if (images.length) body.image = images;
  return { body: body, facts: facts, action: images.length ? "image_to_image" : "text_to_image" };
}

function authHeaders(ctx) {
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + ctx.apiKey };
}

export function buildSubmitRequest(ctx) {
  const model = modelOf(ctx);
  const request = isImageModel(ctx) ? imageRequest(ctx) : videoRequest(ctx);
  return { url: ctx.baseUrl + "/v1/task/submit/" + model, method: "POST", headers: authHeaders(ctx), body: request.body, action: request.action };
}

export function parseSubmitResponse(ctx, resp) {
  const body = resp.body;
  const taskId = trimmed(body && body.task_id);
  if (!taskId) throw new Error(trimmed(body && body.message) || "iCreat returned no task_id");
  return { taskId: taskId, taskData: body };
}

export function extractUsage(ctx) {
  // Legacy per-call pricing charges one call per task; task expressions read the facts.
  if (ctx.usagePurpose === "billing_ratios") return null;
  return (isImageModel(ctx) ? imageRequest(ctx) : videoRequest(ctx)).facts;
}

export function buildQueryRequest(ctx) {
  return { url: ctx.baseUrl + "/v1/task/result", method: "POST", headers: authHeaders(ctx), body: { task_id: ctx.taskId } };
}

function outputs(body, type) {
  const result = body && Array.isArray(body.result) ? body.result : [];
  return result.filter((item) => item && typeof item === "object" && trimmed(item.url) && (!type || trimmed(item.type).toLowerCase() === type));
}

export function parseTaskResult(ctx, body) {
  const status = trimmed(body && body.status).toUpperCase();
  if (["SUBMITTED", "QUEUED", "PENDING"].includes(status)) return { status: "QUEUED", progress: "10%" };
  if (["PROCESSING", "RUNNING", "IN_PROGRESS"].includes(status)) return { status: "IN_PROGRESS", progress: "50%" };
  if (status === "SUCCEEDED") {
    const first = outputs(body)[0];
    if (!first) return { status: "FAILURE", progress: "100%", reason: "iCreat task succeeded without output" };
    return { status: "SUCCESS", progress: "100%", url: trimmed(first.url) };
  }
  if (status === "FAILED") {
    const error = body.error && typeof body.error === "object" ? body.error.message : body.error;
    return { status: "FAILURE", progress: "100%", reason: trimmed(body.message || error || body.reason) || "iCreat task failed" };
  }
  // iCreat answers an unknown task id with HTTP 200 and NOT_FOUND.
  if (status === "NOT_FOUND") return { status: "FAILURE", progress: "100%", reason: "iCreat task not found" };
  return { status: "UNKNOWN", reason: "unrecognized status: " + status };
}

export function extractUsageOnComplete(task, taskResult, body) {
  const facts = {};
  const cost = Number(body && body.costUSD);
  if (body && body.costUSD !== undefined && body.costUSD !== null && body.costUSD !== "" && Number.isFinite(cost) && cost >= 0 && cost <= MAX_UPSTREAM_COST)
    facts.upstream_cost = cost;
  if (has(IMAGE_MODELS, trimmed(task.upstreamModel)) || has(IMAGE_MODELS, trimmed(task.model))) {
    const count = outputs(body, "image").length;
    if (count >= 1 && count <= MAX_OUTPUT_IMAGES) facts.image_count = count;
  }
  return facts;
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  const videos = outputs(task.data, "video");
  if (videos.length) return [{ key: "video", type: "video", mimeType: "video/mp4" }];
  return outputs(task.data, "image").map((_, index) => ({ key: "image-" + (index + 1), type: "image" }));
}

export function buildContentRequest(ctx) {
  let url = "";
  if (ctx.artifactKey === "video") url = trimmed((outputs(ctx.data, "video")[0] || {}).url);
  else {
    const match = /^image-(\d+)$/.exec(trimmed(ctx.artifactKey));
    const image = match ? outputs(ctx.data, "image")[Number(match[1]) - 1] : null;
    url = trimmed(image && image.url);
  }
  if (!url) throw new Error("artifact_not_found");
  // Output URLs are presigned and expire 24 hours after the task completes.
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

// Multipart form fields arrive as strings; uploaded files cannot reach iCreat.
function formFields(body) {
  if ((body.files || []).length) throw new Error("iCreat reads reference media only from HTTPS URLs; pass image URLs instead of uploading files");
  const req = {};
  const fields = body.fields || {};
  for (const name of Object.keys(fields)) {
    if (fields[name].length > 1 && name !== "image" && name !== "image[]") throw new Error(name + " must be provided once");
    req[name.replace(/\[\]$/, "")] = fields[name].length > 1 ? fields[name] : fields[name][0];
  }
  if (req.metadata !== undefined) {
    try {
      req.metadata = JSON.parse(req.metadata);
    } catch (e) {
      throw new Error("metadata must be a JSON object string");
    }
  }
  for (const key of ["seconds", "duration"]) {
    if (req[key] !== undefined) req[key] = Number(req[key]);
  }
  for (const key of ["watermark", "generate_audio"]) {
    if (req[key] !== undefined) req[key] = req[key] === "true";
  }
  return req;
}

function requestFields(ctx) {
  if (ctx.body && ctx.body.kind === "json") {
    const value = ctx.body.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("request body must be an object");
    return value;
  }
  if (ctx.body && ctx.body.kind === "multipart") return formFields(ctx.body);
  throw new Error("JSON or multipart body required");
}

// The host checks every request member named like a usage fact (resolution,
// mode, quality) against the pricing enum at any depth, so a client spelling
// such as "480p" must be rewritten to the canonical value the facts carry.
function canonicalRequest(requestBody, facts) {
  const body = utils.json.clone(requestBody);
  for (const key of ["resolution", "mode", "quality"]) {
    if (!has(facts, key)) continue;
    if (has(body, key)) body[key] = facts[key];
    if (body.metadata && has(body.metadata, key)) body.metadata[key] = facts[key];
  }
  return body;
}

const VIDEO_STATUS = { NOT_START: "queued", SUBMITTED: "queued", QUEUED: "queued", IN_PROGRESS: "in_progress", SUCCESS: "completed", FAILURE: "failed" };

// Prompt text and image URLs from a Responses `input` string or message list.
function responsesInput(req) {
  const texts = [];
  const images = [];
  const input = req.input;
  if (typeof input === "string") texts.push(input);
  else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        texts.push(item);
        continue;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const content = item.content === undefined ? [item] : Array.isArray(item.content) ? item.content : [item.content];
      for (const part of content) {
        if (typeof part === "string") texts.push(part);
        if (!part || typeof part !== "object" || Array.isArray(part)) continue;
        if (["input_text", "text"].includes(part.type) && typeof part.text === "string") texts.push(part.text);
        if (["input_image", "image_url"].includes(part.type)) {
          const image = part.image_url && typeof part.image_url === "object" ? part.image_url.url : part.image_url;
          if (trimmed(image)) images.push(trimmed(image));
        }
      }
    }
  }
  return { prompt: texts.filter((text) => trimmed(text)).join("\n"), images: images };
}

// Responses output text: the video, or every image, through host artifact URLs.
function responsesOutputText(ctx, task) {
  const artifacts = (ctx && ctx.artifacts) || {};
  if (outputs(task.data, "video").length) {
    const url = trimmed(artifacts.video && artifacts.video.url);
    if (!url) throw new Error("video artifact is unavailable");
    const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return '<video controls src="' + escaped + '"></video>';
  }
  const parts = outputs(task.data, "image").map((_, index) => {
    const artifact = artifacts["image-" + (index + 1)];
    if (!artifact || !trimmed(artifact.url)) throw new Error("image artifact is unavailable");
    return "![Image " + (index + 1) + "](<" + artifact.url + ">)";
  });
  if (!parts.length) throw new Error("image artifact is unavailable");
  return parts.join("\n\n");
}

export const protocols = {
  openai_responses: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = ctx.body.value;
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("request body must be an object");
      if (req.input !== undefined && typeof req.input !== "string" && !Array.isArray(req.input)) throw new Error("input must be a string or array");
      const model = trimmed(ctx.model || req.model);
      if (!model) throw new Error("model is required");
      const input = responsesInput(req);
      const images = listOf(req.image).concat(listOf(req.images), listOf(req.input_reference), input.images);
      const requestBody = { model: model, prompt: input.prompt || trimmed(req.prompt) };
      const target = { model: model, upstreamModel: ctx.upstreamModel, requestBody: requestBody };
      if (isImageModel(target)) {
        if (images.length) requestBody.image = images;
        for (const key of ["size", "quality", "aspect_ratio", "image_size", "output_format", "watermark"]) {
          if (has(req, key)) requestBody[key] = req[key];
        }
        const request = imageRequest(target);
        return { kind: "submit", model: model, action: request.action, requestBody: canonicalRequest(requestBody, request.facts) };
      }
      requestBody.metadata = plainObject(req.metadata, "metadata");
      if (images.length) requestBody.images = images;
      for (const key of ["seconds", "duration", "size", "resolution", "ratio", "mode", "negative_prompt", "generate_audio"]) {
        if (has(req, key)) requestBody[key] = req[key];
      }
      const request = videoRequest(target);
      return { kind: "submit", model: model, action: request.action, requestBody: canonicalRequest(requestBody, request.facts) };
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const value = Number(String(task.progress || "").replace("%", ""));
      const progress = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
      const state = { status: status, progress: progress };
      if (status === "SUCCESS") {
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: responsesOutputText(ctx, task) }];
        return { events: events, state: state, done: true };
      }
      if (status === "FAILURE") return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state: state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state: state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state: state, done: false };
    },
    renderFinal: function (ctx, task) {
      return {
        output: [
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: responsesOutputText(ctx, task), annotations: [], logprobs: [] }],
          },
        ],
        metadata: { vendor: "icreat" },
      };
    },
  },
  openai_video: {
    decodeRequest: function (ctx) {
      const req = requestFields(ctx);
      const requestBody = { model: ctx.model, prompt: trimmed(req.prompt), metadata: plainObject(req.metadata, "metadata") };
      for (const key of ["seconds", "duration", "size", "resolution", "ratio", "mode", "negative_prompt", "watermark", "generate_audio", "image", "images", "input_reference"]) {
        if (has(req, key)) requestBody[key] = req[key];
      }
      // Validate against the model's capabilities before any quota is reserved.
      const request = videoRequest({ model: ctx.model, upstreamModel: ctx.upstreamModel, requestBody: requestBody });
      return { kind: "submit", model: ctx.model, action: request.action, requestBody: canonicalRequest(requestBody, request.facts) };
    },
    render: function (ctx, task) {
      const output = {
        id: task.task_id,
        object: "video",
        status: VIDEO_STATUS[task.status] || "queued",
        progress: Number(String(task.progress || "0").replace("%", "")) || 0,
        created_at: task.created_at,
      };
      if (task.status === "SUCCESS") output.completed_at = task.updated_at;
      if (task.status === "FAILURE") output.error = { message: task.fail_reason || "task failed", code: "task_failed" };
      return output;
    },
  },
  // OpenAI Images API. The host polls the iCreat task inside the request and
  // answers with the image URLs; it also resolves response_format b64_json.
  openai_image: {
    decodeRequest: function (ctx) {
      const req = requestFields(ctx);
      if (req.stream !== undefined && req.stream !== false && req.stream !== "false") throw new Error("stream is not supported");
      if (req.n !== undefined && req.n !== null && Number(req.n) !== 1) throw new Error("n must be 1");
      if (req.mask !== undefined) throw new Error("mask is not supported");
      if (req.response_format !== undefined && req.response_format !== "url" && req.response_format !== "b64_json")
        throw new Error("response_format must be url or b64_json");
      const requestBody = { model: ctx.model };
      for (const key of ["prompt", "size", "quality", "image", "aspect_ratio", "image_size", "output_format", "watermark"]) {
        if (has(req, key)) requestBody[key] = req[key];
      }
      const request = imageRequest({ model: ctx.model, upstreamModel: ctx.upstreamModel, requestBody: requestBody });
      if (ctx.operation === "edit" && request.action !== "image_to_image") throw new Error("image is required");
      return { kind: "submit", model: ctx.model, action: request.action, requestBody: canonicalRequest(requestBody, request.facts) };
    },
    render: function (ctx, task) {
      return { created: task.created_at, data: outputs(task.data, "image").map((item) => ({ url: trimmed(item.url) })) };
    },
  },
};
