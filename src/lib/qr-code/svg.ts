const VERSION = 5;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 108;
const ECC_CODEWORDS = 26;
const TOTAL_CODEWORDS = DATA_CODEWORDS + ECC_CODEWORDS;
const QUIET_ZONE = 4;
const FORMAT_XOR_MASK = 0x5412;
const FORMAT_GENERATOR = 0x537;
const EC_LEVEL_LOW_FORMAT_BITS = 1;

const EXP_TABLE: number[] = [];
const LOG_TABLE: number[] = [];

let fieldValue = 1;

for (let index = 0; index < 255; index += 1) {
  EXP_TABLE[index] = fieldValue;
  LOG_TABLE[fieldValue] = index;
  fieldValue <<= 1;

  if (fieldValue & 0x100) {
    fieldValue ^= 0x11d;
  }
}

for (let index = 255; index < 512; index += 1) {
  EXP_TABLE[index] = EXP_TABLE[index - 255] ?? 0;
}

function getExp(index: number) {
  return EXP_TABLE[index] ?? 0;
}

function getLog(index: number) {
  return LOG_TABLE[index] ?? 0;
}

function finiteFieldMultiply(left: number, right: number) {
  if (left === 0 || right === 0) {
    return 0;
  }

  return getExp((getLog(left) + getLog(right)) % 255);
}

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function bitsToCodewords(bits: number[]) {
  const codewords: number[] = [];

  for (let index = 0; index < bits.length; index += 8) {
    let codeword = 0;

    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      codeword = (codeword << 1) | (bits[index + bitIndex] ?? 0);
    }

    codewords.push(codeword);
  }

  return codewords;
}

function createReedSolomonDivisor(degree: number) {
  const result = Array.from({ length: degree - 1 }, () => 0);
  result.push(1);

  let root = 1;

  for (let degreeIndex = 0; degreeIndex < degree; degreeIndex += 1) {
    for (let index = 0; index < result.length; index += 1) {
      result[index] = finiteFieldMultiply(result[index] ?? 0, root);

      if (index + 1 < result.length) {
        result[index] = (result[index] ?? 0) ^ (result[index + 1] ?? 0);
      }
    }

    root = finiteFieldMultiply(root, 0x02);
  }

  return result;
}

function createReedSolomonRemainder(data: number[], degree: number) {
  const divisor = createReedSolomonDivisor(degree);
  const result = Array.from({ length: degree }, () => 0);

  for (const codeword of data) {
    const factor = codeword ^ (result.shift() ?? 0);
    result.push(0);

    for (let index = 0; index < result.length; index += 1) {
      result[index] = (result[index] ?? 0) ^ finiteFieldMultiply(divisor[index] ?? 0, factor);
    }
  }

  return result;
}

function createDataCodewords(value: string) {
  const bytes = Array.from(Buffer.from(value, "utf8"));
  const maxByteLength = DATA_CODEWORDS - 2;

  if (bytes.length > maxByteLength) {
    throw new Error(
      `URL verifikasi terlalu panjang untuk QR nota (${bytes.length}/${maxByteLength} byte).`,
    );
  }

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);

  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const maxDataBits = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, maxDataBits - bits.length));

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = bitsToCodewords(bits);
  const padBytes = [0xec, 0x11];
  let padIndex = 0;

  while (codewords.length < DATA_CODEWORDS) {
    codewords.push(padBytes[padIndex % 2] ?? 0xec);
    padIndex += 1;
  }

  return codewords;
}

class QrMatrix {
  modules: boolean[][];
  reserved: boolean[][];

  constructor() {
    this.modules = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => false),
    );
    this.reserved = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => false),
    );
  }

  clone() {
    const next = new QrMatrix();
    next.modules = this.modules.map((row) => [...row]);
    next.reserved = this.reserved.map((row) => [...row]);

    return next;
  }

  isInBounds(row: number, column: number) {
    return row >= 0 && row < SIZE && column >= 0 && column < SIZE;
  }

  setFunction(row: number, column: number, isDark: boolean) {
    if (!this.isInBounds(row, column)) {
      return;
    }

    this.modules[row]![column] = isDark;
    this.reserved[row]![column] = true;
  }

  reserve(row: number, column: number) {
    if (!this.isInBounds(row, column)) {
      return;
    }

    this.reserved[row]![column] = true;
  }

  isReserved(row: number, column: number) {
    return this.reserved[row]?.[column] ?? false;
  }

  setData(row: number, column: number, isDark: boolean) {
    this.modules[row]![column] = isDark;
  }

  get(row: number, column: number) {
    return this.modules[row]?.[column] ?? false;
  }
}

function addFinderPattern(matrix: QrMatrix, top: number, left: number) {
  for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
      const row = top + rowOffset;
      const column = left + columnOffset;

      if (!matrix.isInBounds(row, column)) {
        continue;
      }

      const isInside =
        rowOffset >= 0 && rowOffset <= 6 && columnOffset >= 0 && columnOffset <= 6;
      const isDark =
        isInside &&
        (rowOffset === 0 ||
          rowOffset === 6 ||
          columnOffset === 0 ||
          columnOffset === 6 ||
          (rowOffset >= 2 &&
            rowOffset <= 4 &&
            columnOffset >= 2 &&
            columnOffset <= 4));

      matrix.setFunction(row, column, isDark);
    }
  }
}

function addAlignmentPattern(matrix: QrMatrix, centerRow: number, centerColumn: number) {
  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset));
      matrix.setFunction(
        centerRow + rowOffset,
        centerColumn + columnOffset,
        distance !== 1,
      );
    }
  }
}

function reserveFormatAreas(matrix: QrMatrix) {
  for (let index = 0; index <= 8; index += 1) {
    matrix.reserve(8, index);
    matrix.reserve(index, 8);
  }

  for (let index = 0; index < 8; index += 1) {
    matrix.reserve(SIZE - 1 - index, 8);
  }

  matrix.reserve(8, SIZE - 8);

  for (let index = 8; index < 15; index += 1) {
    matrix.reserve(8, SIZE - 15 + index);
  }
}

function createBaseMatrix() {
  const matrix = new QrMatrix();

  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, 0, SIZE - 7);
  addFinderPattern(matrix, SIZE - 7, 0);

  for (let index = 8; index < SIZE - 8; index += 1) {
    const isDark = index % 2 === 0;
    matrix.setFunction(6, index, isDark);
    matrix.setFunction(index, 6, isDark);
  }

  addAlignmentPattern(matrix, 30, 30);
  matrix.setFunction(4 * VERSION + 9, 8, true);
  reserveFormatAreas(matrix);

  return matrix;
}

function getMaskBit(mask: number, row: number, column: number) {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return column % 3 === 0;
    case 3:
      return (row + column) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    case 7:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function drawCodewords(baseMatrix: QrMatrix, codewords: number[], mask: number) {
  const matrix = baseMatrix.clone();
  const bits: number[] = [];

  for (const codeword of codewords) {
    appendBits(bits, codeword, 8);
  }

  let bitIndex = 0;
  let upward = true;

  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }

    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const row = upward ? SIZE - 1 - vertical : vertical;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const column = right - columnOffset;

        if (matrix.isReserved(row, column)) {
          continue;
        }

        const rawBit = bits[bitIndex] === 1;
        bitIndex += 1;
        matrix.setData(row, column, rawBit !== getMaskBit(mask, row, column));
      }
    }

    upward = !upward;
  }

  if (bitIndex < TOTAL_CODEWORDS * 8) {
    throw new Error("QR codeword placement tidak cukup untuk kapasitas version 5-L.");
  }

  return matrix;
}

function getFormatBits(mask: number) {
  const data = (EC_LEVEL_LOW_FORMAT_BITS << 3) | mask;
  let bits = data << 10;

  for (let index = 14; index >= 10; index -= 1) {
    if (((bits >>> index) & 1) !== 0) {
      bits ^= FORMAT_GENERATOR << (index - 10);
    }
  }

  return ((data << 10) | bits) ^ FORMAT_XOR_MASK;
}

function readFormatBit(bits: number, index: number) {
  return ((bits >>> (14 - index)) & 1) !== 0;
}

function drawFormatBits(matrix: QrMatrix, mask: number) {
  const bits = getFormatBits(mask);

  for (let index = 0; index <= 5; index += 1) {
    matrix.setFunction(8, index, readFormatBit(bits, index));
  }

  matrix.setFunction(8, 7, readFormatBit(bits, 6));
  matrix.setFunction(8, 8, readFormatBit(bits, 7));
  matrix.setFunction(7, 8, readFormatBit(bits, 8));

  for (let index = 9; index < 15; index += 1) {
    matrix.setFunction(14 - index, 8, readFormatBit(bits, index));
  }

  for (let index = 0; index < 8; index += 1) {
    matrix.setFunction(SIZE - 1 - index, 8, readFormatBit(bits, index));
  }

  for (let index = 8; index < 15; index += 1) {
    matrix.setFunction(8, SIZE - 15 + index, readFormatBit(bits, index));
  }

  matrix.setFunction(4 * VERSION + 9, 8, true);
}

function getPenaltyRun(line: boolean[]) {
  let penalty = 0;
  let runColor = line[0] ?? false;
  let runLength = 1;

  for (let index = 1; index < line.length; index += 1) {
    if (line[index] === runColor) {
      runLength += 1;
      continue;
    }

    if (runLength >= 5) {
      penalty += 3 + runLength - 5;
    }

    runColor = line[index] ?? false;
    runLength = 1;
  }

  if (runLength >= 5) {
    penalty += 3 + runLength - 5;
  }

  return penalty;
}

function hasFinderLikePattern(line: boolean[], start: number) {
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversePattern = [false, false, false, false, true, false, true, true, true, false, true];

  return pattern.every((value, offset) => line[start + offset] === value) ||
    reversePattern.every((value, offset) => line[start + offset] === value);
}

function calculatePenalty(matrix: QrMatrix) {
  let penalty = 0;
  let darkModules = 0;

  for (let row = 0; row < SIZE; row += 1) {
    const rowLine = matrix.modules[row] ?? [];
    penalty += getPenaltyRun(rowLine);

    for (let column = 0; column + 10 < SIZE; column += 1) {
      if (hasFinderLikePattern(rowLine, column)) {
        penalty += 40;
      }
    }
  }

  for (let column = 0; column < SIZE; column += 1) {
    const columnLine = Array.from({ length: SIZE }, (_, row) => matrix.get(row, column));
    penalty += getPenaltyRun(columnLine);

    for (let row = 0; row + 10 < SIZE; row += 1) {
      if (hasFinderLikePattern(columnLine, row)) {
        penalty += 40;
      }
    }
  }

  for (let row = 0; row < SIZE - 1; row += 1) {
    for (let column = 0; column < SIZE - 1; column += 1) {
      const color = matrix.get(row, column);

      if (
        matrix.get(row, column + 1) === color &&
        matrix.get(row + 1, column) === color &&
        matrix.get(row + 1, column + 1) === color
      ) {
        penalty += 3;
      }
    }
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (matrix.get(row, column)) {
        darkModules += 1;
      }
    }
  }

  const totalModules = SIZE * SIZE;
  penalty += Math.floor(Math.abs(darkModules * 20 - totalModules * 10) / totalModules) * 10;

  return penalty;
}

function buildQrMatrix(value: string) {
  const dataCodewords = createDataCodewords(value);
  const errorCorrectionCodewords = createReedSolomonRemainder(dataCodewords, ECC_CODEWORDS);
  const allCodewords = [...dataCodewords, ...errorCorrectionCodewords];
  const baseMatrix = createBaseMatrix();
  let bestMatrix: QrMatrix | null = null;
  let lowestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = drawCodewords(baseMatrix, allCodewords, mask);
    drawFormatBits(matrix, mask);
    const penalty = calculatePenalty(matrix);

    if (penalty < lowestPenalty) {
      bestMatrix = matrix;
      lowestPenalty = penalty;
    }
  }

  if (!bestMatrix) {
    throw new Error("QR gagal dibuat.");
  }

  return bestMatrix;
}

function createQrSvg(value: string) {
  const matrix = buildQrMatrix(value);
  const viewBoxSize = SIZE + QUIET_ZONE * 2;
  const pathParts: string[] = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (matrix.get(row, column)) {
        pathParts.push(`M${column + QUIET_ZONE},${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${viewBoxSize}v${viewBoxSize}H0z"/><path fill="#111" d="${pathParts.join("")}"/></svg>`;
}


export function createQrSvgDataUri(value: string) {
  return `data:image/svg+xml;base64,${Buffer.from(createQrSvg(value)).toString("base64")}`;
}
