type SeriesGenerator = (position: number) => string | null;

type ParsedNumberToken = {
  value: number;
  decimalPlaces: number;
};

type DateFormatKind = "dash" | "slash" | "dot" | "cn";

type ParsedDateToken = {
  serialDay: number;
  formatKind: DateFormatKind;
  yearWidth: number;
  monthWidth: number;
  dayWidth: number;
};

type ParsedVersionToken = {
  prefix: string;
  suffix: string;
  segments: number[];
  widths: number[];
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const numberPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

function areNumbersClose(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}

function inferArithmeticStep(values: number[]) {
  if (values.length <= 1) {
    return 1;
  }

  const deltas = values.slice(1).map((value, index) => value - values[index]);
  if (deltas.length <= 1) {
    return deltas[0] ?? 1;
  }

  const firstDelta = deltas[0] ?? 0;
  return deltas.every((delta) => areNumbersClose(delta, firstDelta)) ? firstDelta : null;
}

function parseNumberToken(rawValue: string): ParsedNumberToken | null {
  const trimmedValue = rawValue.trim();
  if (!numberPattern.test(trimmedValue)) {
    return null;
  }

  const numericValue = Number(trimmedValue);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const decimalPart = trimmedValue.split(".")[1] ?? "";
  return {
    value: numericValue,
    decimalPlaces: decimalPart.length,
  };
}

function inferNumericSeries(values: string[]): SeriesGenerator | null {
  const parsedTokens = values.map(parseNumberToken);
  if (parsedTokens.some((token) => token === null)) {
    return null;
  }

  const numericTokens = parsedTokens as ParsedNumberToken[];
  const baseValue = numericTokens[0]?.value;
  if (baseValue === undefined) {
    return null;
  }

  const step = inferArithmeticStep(numericTokens.map((token) => token.value));
  if (step === null) {
    return null;
  }

  const precision = Math.max(...numericTokens.map((token) => token.decimalPlaces));
  const scale = precision > 0 ? 10 ** precision : 1;

  return (position) => {
    const nextValue = baseValue + step * position;
    if (!Number.isFinite(nextValue)) {
      return null;
    }

    if (precision <= 0) {
      return String(Math.round(nextValue));
    }

    const roundedValue = Math.round(nextValue * scale) / scale;
    return roundedValue.toFixed(precision);
  };
}

function buildUtcDate(year: number, month: number, day: number) {
  const utcValue = Date.UTC(year, month - 1, day);
  const date = new Date(utcValue);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDateToken(rawValue: string): ParsedDateToken | null {
  const trimmedValue = rawValue.trim();
  const patterns: Array<{
    kind: DateFormatKind;
    regex: RegExp;
  }> = [
    { kind: "dash", regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/ },
    { kind: "slash", regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/ },
    { kind: "dot", regex: /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/ },
    { kind: "cn", regex: /^(\d{4})年(\d{1,2})月(\d{1,2})日$/ },
  ];

  for (const pattern of patterns) {
    const match = trimmedValue.match(pattern.regex);
    if (!match) {
      continue;
    }

    const yearText = match[1] ?? "";
    const monthText = match[2] ?? "";
    const dayText = match[3] ?? "";
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = buildUtcDate(year, month, day);
    if (!date) {
      return null;
    }

    return {
      serialDay: Math.floor(date.getTime() / millisecondsPerDay),
      formatKind: pattern.kind,
      yearWidth: yearText.length,
      monthWidth: monthText.length,
      dayWidth: dayText.length,
    };
  }

  return null;
}

function formatDateToken(date: Date, format: ParsedDateToken) {
  const year = String(date.getUTCFullYear()).padStart(format.yearWidth, "0");
  const month = String(date.getUTCMonth() + 1).padStart(format.monthWidth, "0");
  const day = String(date.getUTCDate()).padStart(format.dayWidth, "0");

  switch (format.formatKind) {
    case "dash":
      return `${year}-${month}-${day}`;
    case "slash":
      return `${year}/${month}/${day}`;
    case "dot":
      return `${year}.${month}.${day}`;
    case "cn":
      return `${year}年${month}月${day}日`;
    default:
      return null;
  }
}

function inferDateSeries(values: string[]): SeriesGenerator | null {
  const parsedTokens = values.map(parseDateToken);
  if (parsedTokens.some((token) => token === null)) {
    return null;
  }

  const dateTokens = parsedTokens as ParsedDateToken[];
  const baseToken = dateTokens[0];
  if (!baseToken) {
    return null;
  }

  const hasConsistentFormat = dateTokens.every(
    (token) =>
      token.formatKind === baseToken.formatKind &&
      token.yearWidth === baseToken.yearWidth &&
      token.monthWidth === baseToken.monthWidth &&
      token.dayWidth === baseToken.dayWidth,
  );
  if (!hasConsistentFormat) {
    return null;
  }

  const step = inferArithmeticStep(dateTokens.map((token) => token.serialDay));
  if (step === null) {
    return null;
  }

  return (position) => {
    const serialDay = baseToken.serialDay + step * position;
    if (!Number.isInteger(serialDay)) {
      return null;
    }

    const date = new Date(serialDay * millisecondsPerDay);
    return formatDateToken(date, baseToken);
  };
}

function parseVersionToken(rawValue: string): ParsedVersionToken | null {
  const trimmedValue = rawValue.trim();
  const match = trimmedValue.match(/^(.*?)(\d+(?:\.\d+)+)(.*?)$/);
  if (!match) {
    return null;
  }

  const versionBody = match[2] ?? "";
  const segmentTexts = versionBody.split(".");
  if (segmentTexts.length < 2) {
    return null;
  }

  const segments = segmentTexts.map((segment) => Number(segment));
  if (segments.some((segment) => !Number.isInteger(segment) || segment < 0)) {
    return null;
  }

  return {
    prefix: match[1] ?? "",
    suffix: match[3] ?? "",
    segments,
    widths: segmentTexts.map((segment) => segment.length),
  };
}

function inferVersionSeries(values: string[]): SeriesGenerator | null {
  const parsedTokens = values.map(parseVersionToken);
  if (parsedTokens.some((token) => token === null)) {
    return null;
  }

  const versionTokens = parsedTokens as ParsedVersionToken[];
  const baseToken = versionTokens[0];
  if (!baseToken) {
    return null;
  }

  const hasCompatibleShape = versionTokens.every(
    (token) =>
      token.prefix === baseToken.prefix &&
      token.suffix === baseToken.suffix &&
      token.segments.length === baseToken.segments.length,
  );
  if (!hasCompatibleShape) {
    return null;
  }

  const deltas = versionTokens.slice(1).map((token, index) =>
    token.segments.map((segment, segmentIndex) => segment - versionTokens[index]!.segments[segmentIndex]!),
  );
  const firstDelta = deltas[0] ?? baseToken.segments.map((_, index, array) => (index === array.length - 1 ? 1 : 0));

  if (
    deltas.length > 1 &&
    !deltas.every((delta) => delta.every((segmentDelta, index) => segmentDelta === firstDelta[index]))
  ) {
    return null;
  }

  return (position) => {
    const nextSegments = baseToken.segments.map((segment, index) => segment + firstDelta[index]! * position);
    if (nextSegments.some((segment) => !Number.isInteger(segment) || segment < 0)) {
      return null;
    }

    return `${baseToken.prefix}${nextSegments.map((segment, index) => String(segment).padStart(baseToken.widths[index] ?? 1, "0")).join(".")}${baseToken.suffix}`;
  };
}

export function buildAutoFillSeriesGenerator(values: string[]): SeriesGenerator | null {
  if (values.length === 0) {
    return null;
  }

  return inferDateSeries(values) ?? inferVersionSeries(values) ?? inferNumericSeries(values);
}