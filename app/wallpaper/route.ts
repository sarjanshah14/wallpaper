import sharp from "sharp";
import { openSync } from "fontkit";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

const WIDTH = 1179;
const HEIGHT = 2556;

const fontPath = path.join(process.cwd(), "fonts", "Arial.ttf");
const font = openSync(fontPath);

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
  return font.layout(text).advanceWidth * (size / font.unitsPerEm);
}

function fitText(text: string, maxWidth: number, size: number) {
  if (textWidth(text, size) <= maxWidth) return text;

  let result = text;

  while (result.length > 1 && textWidth(result + "...", size) > maxWidth) {
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
            <text
              x="${x}"
              y="${y}"
              font-family="Arial"
              font-size="32"
              font-weight="700"
              fill="#FFFFFF"
            >${escapeXml(word)}</text>

            ${
              meaning
                ? `
            <text
              x="${x}"
              y="${y + 50}"
              font-family="Arial"
              font-size="28"
              fill="#B8B8B8"
            >${escapeXml(meaning)}</text>
            `
                : ""
            }
          `;
        })
        .join("");

    const svg = `
      <svg
        width="${WIDTH}"
        height="${HEIGHT}"
        viewBox="0 0 ${WIDTH} ${HEIGHT}"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="${WIDTH}" height="${HEIGHT}" fill="#111111"/>

        <text
          x="589.5"
          y="635"
          text-anchor="middle"
          font-family="Arial"
          font-size="30"
          font-weight="700"
          fill="#FFFFFF"
        >GRE VOCABULARY</text>

        <text
          x="589.5"
          y="680"
          text-anchor="middle"
          font-family="Arial"
          font-size="22"
          fill="#777777"
        >${words.length} WORDS</text>

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
