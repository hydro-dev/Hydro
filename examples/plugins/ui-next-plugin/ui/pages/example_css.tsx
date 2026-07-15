import { Link } from '@hydrooj/ui-next';
import styles from '../styles.module.css'; // (1) CSS module — scoped class names

export default function ExampleCss() {
    return (
        <div className={styles.card}>
            <span className={styles.badge}>CSS module</span>
            <h2 className={styles.title}>Scoped class names</h2>
            <p><Link to="example_home">← Back</Link></p>
        </div>
    );
}
