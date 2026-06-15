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
const leaderPowerLabelDefenderWeight = 0.72;
const battlePowerEntryOffset = 220;
const battlePowerEntryDurationMs = 220;

type BattlePowerLabelTarget = "fieldCard" | "leader";
type BattlePowerTone =
  | "weak"
  | "power-5000"
  | "power-6000"
  | "power-7000"
  | "power-8000"
  | "power-9000"
  | "over-10000";

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

export const battlePowerTone = (power: number): BattlePowerTone => {
  if (power >= 10000) {
    return "over-10000";
  }
  if (power >= 9000) {
    return "power-9000";
  }
  if (power >= 8000) {
    return "power-8000";
  }
  if (power >= 7000) {
    return "power-7000";
  }
  if (power >= 6000) {
    return "power-6000";
  }
  if (power >= 5000) {
    return "power-5000";
  }
  return "weak";
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

const cssStringValue = (value: string): string =>
  value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');

export const cardInstanceSelector = (instanceId: string): string =>
  `[data-card-instance-id="${cssStringValue(instanceId)}"]`;

const cardElementForInstance = (
  board: HTMLElement,
  instanceId: string,
): HTMLElement | undefined =>
  board.querySelector<HTMLElement>(cardInstanceSelector(instanceId)) ??
  undefined;

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
  const [line, setLine] = useState<ArrowLine>(emptyLine);
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
  const selfPower = battleArrow?.selfPower ?? battleArrow?.attackPower;
  const opponentPower = battleArrow?.opponentPower ?? battleArrow?.defendPower;
  const hasMeasuredLine = line.x1 !== line.x2 || line.y1 !== line.y2;
  const powerLabelPoint = battlePowerLabelPoint(line, powerLabelTarget);

  if (battleArrow === undefined) {
    return null;
  }
  const renderSelfPower = selfPower;
  const renderOpponentPower = opponentPower;

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
      {renderSelfPower !== undefined && hasMeasuredLine ? (
        <g
          className="battle-arrow-power"
          transform={`translate(${String(powerLabelPoint.x)} ${String(powerLabelPoint.y)})`}
        >
          {renderOpponentPower === undefined ? null : (
            <>
              <text
                className={`battle-arrow-power-value is-opponent is-${battlePowerTone(renderOpponentPower)}`}
                dominantBaseline="central"
                textAnchor="middle"
                x="0"
                y="-0.92em"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from={`${String(-battlePowerEntryOffset)} 0`}
                  to="0 0"
                  dur={`${String(battlePowerEntryDurationMs)}ms`}
                  fill="freeze"
                />
                <animate
                  attributeName="opacity"
                  from="0"
                  to="1"
                  dur={`${String(battlePowerEntryDurationMs)}ms`}
                  fill="freeze"
                />
                {renderOpponentPower}
              </text>
              <text
                className="battle-arrow-power-vs"
                dominantBaseline="central"
                textAnchor="middle"
                x="0"
                y="0"
              >
                vs
              </text>
            </>
          )}
          <text
            className={`battle-arrow-power-value is-self is-${battlePowerTone(renderSelfPower)}`}
            dominantBaseline="central"
            textAnchor="middle"
            x="0"
            y={renderOpponentPower === undefined ? "0" : "0.98em"}
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              from={`${String(battlePowerEntryOffset)} 0`}
              to="0 0"
              dur={`${String(battlePowerEntryDurationMs)}ms`}
              fill="freeze"
            />
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur={`${String(battlePowerEntryDurationMs)}ms`}
              fill="freeze"
            />
            {renderSelfPower}
          </text>
        </g>
      ) : null}
    </svg>
  );
};
