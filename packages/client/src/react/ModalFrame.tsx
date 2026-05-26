export interface ModalFrameProps {
  title: string;
  className: string;
  onClose?: (() => void) | undefined;
  children: React.ReactNode;
}

export const ModalFrame = ({
  title,
  className,
  onClose,
  children,
}: ModalFrameProps): React.JSX.Element => (
  <section
    className={`modal-frame ${className}`}
    onClick={(event) => {
      event.stopPropagation();
    }}
  >
    <div className="modal-frame-header">
      <h2>{title}</h2>
      {onClose === undefined ? null : (
        <button className="modal-frame-close" type="button" onClick={onClose}>
          Close
        </button>
      )}
    </div>
    {children}
  </section>
);
