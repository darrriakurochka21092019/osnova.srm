import wordmark from './assets/eduspace-logo.png';
import symbol from './assets/eduspace-mark.png';
import './brand.css';

export function Brand({ mark = false, className = '' }: { mark?: boolean; className?: string }) {
  // Frame the supplied artwork without its transparent outer margins.
  return (
    <svg
      className={`brand-logo ${mark ? 'brand-logo--mark' : ''} ${className}`}
      viewBox={mark ? '90 245 1075 820' : '58 155 1950 375'}
      width={mark ? 1075 : 1950}
      height={mark ? 820 : 375}
      role="img"
      aria-label="EduSpace"
      focusable="false"
    >
      <image
        href={mark ? symbol : wordmark}
        width={mark ? 1254 : 2048}
        height={mark ? 1254 : 682}
      />
    </svg>
  );
}
