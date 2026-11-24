import styles from "./BookArtwork.module.css";

export default function BookArtwork() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.book}>
        <div className={styles.leftPage}>
          <span className={styles.rule} />
          <span className={styles.plate}>
            <span className={styles.sun} />
            <span className={styles.ridges} />
          </span>
          <span className={styles.caption} />
        </div>
        <div className={styles.rightPage}>
          <span className={styles.rule} />
          <span className={styles.diagram} />
          <span className={styles.lines} />
          <span className={styles.bookmark} />
        </div>
      </div>
      <span className={styles.pencil} />
    </div>
  );
}
