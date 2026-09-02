import sharp from "sharp";
import { openSync } from "fontkit";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

const WIDTH = 1179;
const HEIGHT = 2556;

const fontPath = path.join(process.cwd(), "fonts", "Arial.ttf");
const font = openSync(fontPath) as import("fontkit").Font;

function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.toLowerCase() !== "new words")
    .map((line) => {
      const separator = line.indexOf("=");

      if (separator === -1) {
        return { word: line, meaning: "" };
      }

      return {
        word: line.slice(0, separator).trim(),
        meaning: line.slice(separator + 1).trim(),
      };
    });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textWidth(text: string, size: number) {
  if (!text) return 0;

  const run = font.layout(text);

  return run.positions.reduce(
    (total, position) => total + position.xAdvance,
    0
  ) * (size / font.unitsPerEm);
}

function textToPath(
  text: string,
  x: number,
  baselineY: number,
  size: number,
  fill: string
) {
  if (!text) return "";

  const run = font.layout(text);
  const scale = size / font.unitsPerEm;

  let cursorX = x;

  return run.glyphs
    .map((glyph, index) => {
      const position = run.positions[index];

      const pathData = glyph.path.toSVG();

      const result = `
        <path
          d="${pathData}"
          transform="translate(${cursorX} ${baselineY}) scale(${scale} ${-scale})"
          fill="${fill}"
        />
      `;

      cursorX += position.xAdvance * scale;

      return result;
    })
    .join("");
}

function fitText(text: string, maxWidth: number, size: number) {
  if (!text) return "";

  if (textWidth(text, size) <= maxWidth) {
    return text;
  }

  let result = text;

  while (
    result.length > 1 &&
    textWidth(result + "...", size) > maxWidth
  ) {
    result = result.slice(0, -1);
  }

  return result + "...";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = String(body.text || "");

    const words = parseLines(text).slice(0, 20);

    const left = words.slice(0, 10);
    const right = words.slice(10, 20);

    const renderColumn = (
      items: { word: string; meaning: string }[],
      x: number
    ) =>
      items
        .map((item, i) => {
          const y = 760 + i * 170;

          const word = fitText(item.word, 490, 32);
          const meaning = fitText(item.meaning, 490, 28);

          return `
            ${textToPath(word, x, y, 32, "#FFFFFF")}

            ${meaning
              ? textToPath(meaning, x, y + 50, 28, "#B8B8B8")
              : ""}
          `;
        })
        .join("");

    const title = "GRE VOCABULARY";
    const titleSize = 30;
    const titleWidth = textWidth(title, titleSize);

    const count = `${words.length} WORDS`;
    const countSize = 22;
    const countWidth = textWidth(count, countSize);

    const svg = `
      <svg
        width="${WIDTH}"
        height="${HEIGHT}"
        viewBox="0 0 ${WIDTH} ${HEIGHT}"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          width="${WIDTH}"
          height="${HEIGHT}"
          fill="#111111"
        />

        ${textToPath(
          title,
          (WIDTH - titleWidth) / 2,
          635,
          titleSize,
          "#FFFFFF"
        )}

        ${textToPath(
          count,
          (WIDTH - countWidth) / 2,
          680,
          countSize,
          "#777777"
        )}

        ${renderColumn(left, 70)}
        ${renderColumn(right, 615)}
      </svg>
    `;

    const png = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { error: "Could not generate wallpaper" },
      { status: 400 }
    );
  }
}
