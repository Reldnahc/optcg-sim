import type { PlayerAvatarView, PlayerProfileTitleView } from "../transport.js";
import { PlayerSummaryLabel } from "./PlayerSummaryLabel.js";
import { Zone } from "./Zone.js";

export interface EmptyPlaymatPlayerSummary {
  label: string;
  avatar?: PlayerAvatarView | undefined;
  title?: PlayerProfileTitleView | undefined;
  status?: "connected" | "disconnected" | undefined;
}

export interface EmptyPlaymatProps {
  selfSummary?: EmptyPlaymatPlayerSummary | undefined;
  opponentSummary?: EmptyPlaymatPlayerSummary | undefined;
}

export const EmptyPlaymat = ({
  selfSummary,
  opponentSummary,
}: EmptyPlaymatProps): React.JSX.Element => (
  <>
    <div className="playmat-side opponent-side">
      <div className="playmat-row opponent-resource-row">
        <div className="playmat-zone opponent-cost">
          <Zone
            label="Cost Area"
            cards={[]}
            size="mini"
            displayMode="overlap"
          />
        </div>
        <div className="playmat-zone opponent-don-deck">
          <Zone
            label="DON!! Deck"
            cards={[]}
            size="small"
            displayMode="stack"
            stackCount={0}
          />
        </div>
        <div className="playmat-zone opponent-trash">
          <Zone label="Trash" cards={[]} size="small" displayMode="stack" />
        </div>
      </div>
      <div className="playmat-field opponent-field">
        <div className="playmat-zone opponent-life">
          <Zone label="Life" cards={[]} size="small" displayMode="life" />
        </div>
        <div className="playmat-zone opponent-deck">
          <Zone
            label="Deck"
            cards={[]}
            size="small"
            displayMode="stack"
            stackCount={0}
          />
        </div>
        <section className="playmat-summary opponent-summary">
          {opponentSummary === undefined ? null : (
            <PlayerSummaryLabel {...opponentSummary} />
          )}
        </section>
        <div className="playmat-zone opponent-leader">
          <Zone label="Leader" cards={[]} size="small" />
        </div>
        <div className="playmat-zone opponent-restriction-area" />
        <div className="playmat-zone opponent-stage">
          <Zone label="Stage" cards={[]} size="small" />
        </div>
        <div className="playmat-zone opponent-characters">
          <Zone
            label="Character Area"
            cards={[]}
            displayMode="slots"
            slotCount={5}
          />
        </div>
      </div>
    </div>
    <div className="playmat-zone center-spacer">
      <div className="opponent-center-spacer" />
      <div className="player-center-spacer" />
    </div>
    <div className="playmat-side player-side">
      <div className="playmat-field player-field">
        <div className="playmat-zone player-characters">
          <Zone
            label="Character Area"
            cards={[]}
            displayMode="slots"
            slotCount={5}
          />
        </div>
        <div className="playmat-zone player-life">
          <Zone label="Life" cards={[]} size="small" displayMode="life" />
        </div>
        <section className="playmat-summary player-summary">
          {selfSummary === undefined ? null : (
            <PlayerSummaryLabel {...selfSummary} />
          )}
        </section>
        <div className="playmat-zone player-leader">
          <Zone label="Leader" cards={[]} size="small" />
        </div>
        <div className="playmat-zone player-restriction-area" />
        <div className="playmat-zone player-stage">
          <Zone label="Stage" cards={[]} size="small" />
        </div>
        <div className="playmat-zone player-deck">
          <Zone
            label="Deck"
            cards={[]}
            size="small"
            displayMode="stack"
            stackCount={0}
          />
        </div>
      </div>
      <div className="playmat-row player-resource-row">
        <div className="playmat-zone player-don-deck">
          <Zone
            label="DON!! Deck"
            cards={[]}
            size="small"
            displayMode="stack"
            stackCount={0}
          />
        </div>
        <div className="playmat-zone player-trash">
          <Zone label="Trash" cards={[]} size="small" displayMode="stack" />
        </div>
        <div className="playmat-zone player-cost">
          <Zone
            label="Cost Area"
            cards={[]}
            size="mini"
            displayMode="overlap"
          />
        </div>
      </div>
    </div>
  </>
);
