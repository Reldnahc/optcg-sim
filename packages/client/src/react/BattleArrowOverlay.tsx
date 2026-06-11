import { useLayoutEffect, useRef, useState } from "react";

import type { BoardViewModel } from "../view-model.js";

interface BattleArrowOverlayProps {
  battleArrow?: BoardViewModel["battleArrow"] | undefined;
}

interface ArrowLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const emptyLine: ArrowLine = { x1: 0, y1: 0, x2: 0, y2: 0 };
const labelCharacterWidth = 13;
const labelInlinePadding = 24;
const labelMinimumWidth = 56;
const labelHeight = 30;

const cardElementForInstance = (
  board: HTMLElement,
  instanceId: string,
): HTMLElement | undefined =>
  Array.from(
    board.querySelectorAll<HTMLElement>("[data-card-instance-id]"),
  ).find((element) => element.dataset["cardInstanceId"] === instanceId);

export const BattleArrowOverlay = ({
  battleArrow,
}: BattleArrowOverlayProps): React.JSX.Element | null => {
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [line, setLine] = useState<ArrowLine>(emptyLine);

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
        setLine(emptyLine);
        return;
      }
      const attackerRect = attacker.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setLine({
        x1: attackerRect.left + attackerRect.width / 2 - boardRect.left,
        y1: attackerRect.top + attackerRect.height / 2 - boardRect.top,
        x2: targetRect.left + targetRect.width / 2 - boardRect.left,
        y2: targetRect.top + targetRect.height / 2 - boardRect.top,
      });
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
  }, [battleArrow]);

  if (battleArrow === undefined) {
    return null;
  }

  const attackPowerLabel =
    battleArrow.attackPower === undefined
      ? undefined
      : String(battleArrow.attackPower);
  const hasMeasuredLine = line.x1 !== line.x2 || line.y1 !== line.y2;
  const labelWidth =
    attackPowerLabel === undefined
      ? labelMinimumWidth
      : Math.max(
          labelMinimumWidth,
          attackPowerLabel.length * labelCharacterWidth + labelInlinePadding,
        );
  const midpointX = (line.x1 + line.x2) / 2;
  const midpointY = (line.y1 + line.y2) / 2;

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
          markerHeight="8"
          markerWidth="8"
          orient="auto"
          refX="7"
          refY="4"
        >
          <path d="M0,0 L8,4 L0,8 Z" />
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
          transform={`translate(${String(midpointX)} ${String(midpointY)})`}
        >
          <rect
            x={-labelWidth / 2}
            y={-labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            rx={labelHeight / 2}
          />
          <text dominantBaseline="central" textAnchor="middle">
            {attackPowerLabel}
          </text>
        </g>
      ) : null}
    </svg>
  );
};
