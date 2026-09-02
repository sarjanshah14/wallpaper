import sharp from "sharp";
import { openSync } from "fontkit";
import path from "path";
import { NextRequest } from "next/server";

const WIDTH = 1179;
const HEIGHT = 2556;

const boldFontPath = path.join(
  process.cwd(),
  "fonts",
  "Arial-Bold.ttf"
);

const boldFont = openSync(
  boldFontPath
) as import("fontkit").Font;

function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.toLowerCase() !== "new words")
    .map((line) => {
      const separator = line.indexOf("=");

      if (separator === -1) {
        return {
          word: line,
          meaning: "",
        };
      }

      return {
        word: line.slice(0, separator).trim(),
        meaning: line.slice(separator + 1).trim(),
      };
    });
}

function getTextWidth(text: string, size: number) {
  if (!text) return 0;

  const run = boldFont.layout(text);

  return (
    run.positions.reduce(
      (total, position) => total + position.xAdvance,
      0
    ) *
    (size / boldFont.unitsPerEm)
  );
}

function fitText(
  text: string,
  maxWidth: number,
  size: number
) {
  if (!text) return "";

  if (getTextWidth(text, size) <= maxWidth) {
    return text;
  }

  let result = text;

  while (
    result.length > 1 &&
    getTextWidth(result + "...", size) > maxWidth
  ) {
    result = result.slice(0, -1);
  }

  return result + "...";
}

function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  maxLines = 2
) {
  if (!text) return [];

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];

  let current = "";
  let wordIndex = 0;

  while (wordIndex < words.length) {
    const test = current
      ? `${current} ${words[wordIndex]}`
      : words[wordIndex];

    if (getTextWidth(test, size) <= maxWidth) {
      current = test;
      wordIndex++;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    } else {
      lines.push(fitText(words[wordIndex], maxWidth, size));
      wordIndex++;
    }

    if (lines.length === maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (wordIndex < words.length && lines.length > 0) {
    let last = lines[lines.length - 1];

    while (
      last.length > 0 &&
      getTextWidth(last + "...", size) > maxWidth
    ) {
      last = last.slice(0, -1);
    }

    lines[lines.length - 1] = last + "...";
  }

  return lines;
}

function textToPath(
  text: string,
  x: number,
  baselineY: number,
  size: number
) {
  if (!text) return "";

  const run = boldFont.layout(text);
  const scale = size / boldFont.unitsPerEm;

  let cursorX = x;

  return run.glyphs
    .map((glyph, index) => {
      const position = run.positions[index];
      const pathData = glyph.path.toSVG();

      const result = `
        <path
          d="${pathData}"
          transform="translate(${cursorX} ${baselineY}) scale(${scale} ${-scale})"
          fill="#000000"
        />
      `;

      cursorX += position.xAdvance * scale;

      return result;
    })
    .join("");
}

function renderColumn(
  items: { word: string; meaning: string }[],
  x: number
) {
  return items
    .map((item, i) => {
      const y = 700 + i * 170;

      const word = fitText(item.word, 490, 46);
      const meaningLines = wrapText(
        item.meaning,
        490,
        36,
        2
      );

      return `
        ${textToPath(word, x, y, 46)}
        ${meaningLines
          .map((line, index) =>
            textToPath(
              line,
              x,
              y + 60 + index * 40,
              36
            )
          )
          .join("")}
      `;
    })
    .join("");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = String(body.text || "");
    const allWords = parseLines(text);

    if (allWords.length === 0) {
      return Response.json(
        { error: "No vocabulary words found" },
        { status: 400 }
      );
    }

    const requestedStart = Number(body.start || 1);
    const startIndex =
      Number.isFinite(requestedStart)
        ? ((Math.floor(requestedStart) - 1) % allWords.length + allWords.length) % allWords.length
        : 0;

    const words = Array.from(
      { length: 20 },
      (_, i) => allWords[(startIndex + i) % allWords.length]
    );

    const left = words.slice(0, 10);
    const right = words.slice(10, 20);

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
          fill="#FFFFFF"
        />

        ${renderColumn(left, 70)}
        ${renderColumn(right, 615)}
      </svg>
    `;

    const png = await sharp(
      Buffer.from(svg)
    )
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
