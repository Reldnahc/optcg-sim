import { useLayoutEffect, useRef, useState } from "react";

import type { BoardViewModel } from "../view-model.js";

interface BattleArrowOverlayProps {
  battleArrow?: BoardViewModel["battleArrow"] | undefined;
}

export interface ArrowLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const emptyLine: ArrowLine = { x1: 0, y1: 0, x2: 0, y2: 0 };
const labelInlinePadding = 32;
const labelBlockPadding = 14;
const labelMinimumWidth = 56;
const labelHeight = 38;
const leaderPowerLabelDefenderWeight = 0.72;
const basePowerLabelBoardWidth = 1280;
const minimumPowerLabelScale = 0.78;
const maximumPowerLabelScale = 1.18;

type BattlePowerLabelTarget = "fieldCard" | "leader";

interface BattlePowerLabelBox {
  readonly width: number;
  readonly height: number;
}

const battlePowerLabel = (
  attackPower: number | undefined,
  defendPower: number | undefined,
): string | undefined => {
  if (attackPower === undefined) {
    return undefined;
  }
  return defendPower === undefined
    ? String(attackPower)
    : `${String(attackPower)} vs ${String(defendPower)}`;
};

export const nextStableArrowLine = (
  previous: ArrowLine,
  next: ArrowLine,
): ArrowLine =>
  previous.x1 === next.x1 &&
  previous.y1 === next.y1 &&
  previous.x2 === next.x2 &&
  previous.y2 === next.y2
    ? previous
    : next;

export const battlePowerLabelPoint = (
  line: ArrowLine,
  target: BattlePowerLabelTarget,
): { x: number; y: number } => {
  const defenderWeight =
    target === "leader" ? leaderPowerLabelDefenderWeight : 0.5;
  return {
    x: line.x1 + (line.x2 - line.x1) * defenderWeight,
    y: line.y1 + (line.y2 - line.y1) * defenderWeight,
  };
};

export const battlePowerLabelScale = (boardWidth: number): number => {
  if (!Number.isFinite(boardWidth) || boardWidth <= 0) {
    return 1;
  }
  return Math.min(
    maximumPowerLabelScale,
    Math.max(minimumPowerLabelScale, boardWidth / basePowerLabelBoardWidth),
  );
};

export const battlePowerLabelBox = (
  textBounds: BattlePowerLabelBox | undefined,
  scale: number,
): BattlePowerLabelBox => {
  if (textBounds === undefined) {
    return {
      width: labelMinimumWidth * scale,
      height: labelHeight * scale,
    };
  }
  return {
    width: Math.max(
      labelMinimumWidth * scale,
      textBounds.width + labelInlinePadding * scale,
    ),
    height: Math.max(
      labelHeight * scale,
      textBounds.height + labelBlockPadding * scale,
    ),
  };
};

const cardElementForInstance = (
  board: HTMLElement,
  instanceId: string,
): HTMLElement | undefined =>
  Array.from(
    board.querySelectorAll<HTMLElement>("[data-card-instance-id]"),
  ).find((element) => element.dataset["cardInstanceId"] === instanceId);

const battlePowerLabelTargetForElement = (
  element: HTMLElement,
): BattlePowerLabelTarget => {
  const zone = element.closest<HTMLElement>("[data-presentation-zone]");
  return zone?.dataset["presentationZone"]?.endsWith(":leaderArea") === true
    ? "leader"
    : "fieldCard";
};

export const BattleArrowOverlay = ({
  battleArrow,
}: BattleArrowOverlayProps): React.JSX.Element | null => {
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const powerTextRef = useRef<SVGTextElement | null>(null);
  const [line, setLine] = useState<ArrowLine>(emptyLine);
  const [boardWidth, setBoardWidth] = useState(0);
  const [textBounds, setTextBounds] = useState<BattlePowerLabelBox>();
  const [powerLabelTarget, setPowerLabelTarget] =
    useState<BattlePowerLabelTarget>("fieldCard");

  useLayoutEffect(() => {
    if (battleArrow === undefined) {
      return;
    }
    const overlay = overlayRef.current;
    if (overlay === null) {
      return;
    }
    const board = overlay.closest(".tabletop-board");
    if (!(board instanceof HTMLElement)) {
      return;
    }

    const updateLine = (): void => {
      const boardRect = board.getBoundingClientRect();
      const attacker = cardElementForInstance(
        board,
        battleArrow.attackerInstanceId,
      );
      const target = cardElementForInstance(
        board,
        battleArrow.targetInstanceId,
      );
      if (attacker === undefined || target === undefined) {
        setLine((currentLine) => nextStableArrowLine(currentLine, emptyLine));
        setBoardWidth(0);
        setPowerLabelTarget("fieldCard");
        return;
      }
      const attackerRect = attacker.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setPowerLabelTarget(battlePowerLabelTargetForElement(target));
      const nextLine = {
        x1: attackerRect.left + attackerRect.width / 2 - boardRect.left,
        y1: attackerRect.top + attackerRect.height / 2 - boardRect.top,
        x2: targetRect.left + targetRect.width / 2 - boardRect.left,
        y2: targetRect.top + targetRect.height / 2 - boardRect.top,
      };
      setBoardWidth(boardRect.width);
      setLine((currentLine) => nextStableArrowLine(currentLine, nextLine));
    };

    updateLine();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLine);
      return () => {
        window.removeEventListener("resize", updateLine);
      };
    }

    const resizeObserver = new ResizeObserver(updateLine);
    resizeObserver.observe(board);
    window.addEventListener("resize", updateLine);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateLine);
    };
  }, [battleArrow?.attackerInstanceId, battleArrow?.targetInstanceId]);

  const attackPowerLabel = battlePowerLabel(
    battleArrow?.attackPower,
    battleArrow?.defendPower,
  );
  const hasMeasuredLine = line.x1 !== line.x2 || line.y1 !== line.y2;
  const powerLabelPoint = battlePowerLabelPoint(line, powerLabelTarget);
  const powerLabelScale = battlePowerLabelScale(boardWidth);
  const labelBox = battlePowerLabelBox(textBounds, powerLabelScale);

  useLayoutEffect(() => {
    const text = powerTextRef.current;
    if (attackPowerLabel === undefined || text === null || !hasMeasuredLine) {
      setTextBounds(undefined);
      return;
    }
    const bounds = text.getBBox();
    setTextBounds((currentBounds) =>
      currentBounds?.width === bounds.width &&
      currentBounds.height === bounds.height
        ? currentBounds
        : { width: bounds.width, height: bounds.height },
    );
  }, [attackPowerLabel, hasMeasuredLine, powerLabelScale]);

  if (battleArrow === undefined) {
    return null;
  }

  return (
    <svg
      ref={overlayRef}
      className="battle-arrow-overlay"
      data-battle-attacker={battleArrow.attackerInstanceId}
      data-battle-power={attackPowerLabel}
      data-battle-target={battleArrow.targetInstanceId}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="battle-arrow-head"
          markerHeight="10"
          markerWidth="10"
          orient="auto"
          refX="9"
          refY="5"
        >
          <path d="M0,0 L10,5 L0,10 Z" />
        </marker>
      </defs>
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        markerEnd="url(#battle-arrow-head)"
      />
      {attackPowerLabel !== undefined && hasMeasuredLine ? (
        <g
          className="battle-arrow-power"
          transform={`translate(${String(powerLabelPoint.x)} ${String(powerLabelPoint.y)})`}
        >
          <rect
            x={-labelBox.width / 2}
            y={-labelBox.height / 2}
            width={labelBox.width}
            height={labelBox.height}
            rx={labelBox.height / 2}
          />
          <text
            ref={powerTextRef}
            dominantBaseline="central"
            textAnchor="middle"
          >
            {attackPowerLabel}
          </text>
        </g>
      ) : null}
    </svg>
  );
};
