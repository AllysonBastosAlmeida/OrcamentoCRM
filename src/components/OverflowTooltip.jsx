import { useEffect } from 'react';

const GENERATED_TITLE_ATTRIBUTE = 'data-overflow-title';

const hasClippedText = (element) => {
  const styles = window.getComputedStyle(element);
  const clipsInlineText =
    styles.textOverflow === 'ellipsis' ||
    (styles.webkitLineClamp && styles.webkitLineClamp !== 'none');

  if (!clipsInlineText) return false;

  return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
};

const findClippedElement = (target) => {
  if (!(target instanceof Element)) return null;

  let element = target;
  while (element && element !== document.body) {
    if (hasClippedText(element)) return element;
    element = element.parentElement;
  }

  return null;
};

const syncTooltip = (event) => {
  const element = findClippedElement(event.target);
  if (!element) return;

  const generatedTitle = element.hasAttribute(GENERATED_TITLE_ATTRIBUTE);
  if (element.hasAttribute('title') && !generatedTitle) return;

  if (!hasClippedText(element)) {
    if (generatedTitle) {
      element.removeAttribute('title');
      element.removeAttribute(GENERATED_TITLE_ATTRIBUTE);
    }
    return;
  }

  const fullText = element.textContent?.replace(/\s+/g, ' ').trim();
  if (!fullText) return;

  element.setAttribute('title', fullText);
  element.setAttribute(GENERATED_TITLE_ATTRIBUTE, 'true');
};

/** Adds a native tooltip to every text element that is actually clipped. */
const OverflowTooltip = () => {
  useEffect(() => {
    document.addEventListener('pointerover', syncTooltip, true);
    document.addEventListener('focusin', syncTooltip, true);

    return () => {
      document.removeEventListener('pointerover', syncTooltip, true);
      document.removeEventListener('focusin', syncTooltip, true);
    };
  }, []);

  return null;
};

export default OverflowTooltip;
