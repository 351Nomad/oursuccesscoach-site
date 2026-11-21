(() => {
  'use strict';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const header = $('#site-header');
  const toggle = $('#menu-toggle');
  toggle.addEventListener('click', () => {
    const open = header.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  $$('.faq-item').forEach((item) => {
    const btn = $('.faq-q', item);
    const panel = $('.faq-a', item);
    const body = $('.faq-body', item);
    btn.addEventListener('click', () => {
      const collapsed = item.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      panel.style.height = collapsed ? '0px' : `${body.clientHeight}px`;
    });
  });
  window.addEventListener('resize', () => {
    $$('.faq-item:not(.collapsed)').forEach((item) => { $('.faq-a', item).style.height = `${$('.faq-body', item).clientHeight}px`; });
  });
})();
