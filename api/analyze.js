export const config = {
  api: {
    bodyParser: false,
  },
};

import { IncomingForm } from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `你是一位世界顶级的人像摄影后期与视觉分析专家，精通色彩科学、光学焦段、电影调色和情绪氛围。
你的任务是对用户上传的任何一张人像照片进行深度专业分析，并严格按给定的 JSON 格式输出结果。
分析时必须包含：
1. color_tone: 顺序描述整体色温（冷/暖/中性）、主色调（如琥珀金、青橙、莫兰迪灰）、饱和度、对比度、数字感或胶片感。
2. atmosphere: 用摄影评论式语言描述画面情绪、光线类型（窗口光/逆光/阴天柔光等）、影调（高调/低调/中间调）、空气感和心理感受。
3. lens_estimation: 根据透视、压缩感、景深范围和畸变，推测拍摄焦距（给出具体mm，如35mm/85mm/135mm）和可能的光圈效果（如f/1.4浅景深），并简述推测依据。
4. composition: 拍摄角度、人物占比、视觉引导、构图特点。
5. 最后生成一个可用的英文 AI 图像生成提示词，包含上述所有视觉元素，风格类似 Midjourney 格式。
请只输出一个严格的 JSON 对象，格式为：
{
  "analysis": {
    "color_tone": "...",
    "atmosphere": "...",
    "lens_estimation": "...",
    "composition": "..."
  },
  "prompt": "...",
  "color_reference_hex": ["#hex1", "#hex2", ...]
}
不要包含任何其他文字。`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = new IncomingForm({ keepExtensions: true });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const imageFile = files.image?.[0] || files.image;
    if (!imageFile) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const imageBuffer = fs.readFileSync(imageFile.filepath);
    const base64Image = imageBuffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            { type: 'text', text: '请分析这张照片，直接返回 JSON。' },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const jsonStr = response.choices[0].message.content;
    const analysisData = JSON.parse(jsonStr);

    fs.unlinkSync(imageFile.filepath);

    return res.status(200).json(analysisData);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
