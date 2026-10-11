tailwind.config = {
  theme: { extend: {
    colors: {
      paper:  '#F6F4EF',
      panel:  '#FBFAF6',
      line:   '#E9E4D8',
      ink:    '#1C2A24',
      muted:  '#68766E',
      accent: { DEFAULT:'#166B4A', dark:'#0E5237', soft:'#E7F1EA' },
      warn:   { DEFAULT:'#A15C0B', soft:'#FCF2DF' },
      danger: { DEFAULT:'#BF4128', soft:'#FBEAE4' },
      info:   { DEFAULT:'#3D5A80', soft:'#E8EEF5' },
    },
    fontFamily: { sans: ['"Plus Jakarta Sans"','ui-sans-serif','system-ui','sans-serif'] },
    boxShadow: {
      soft: '0 1px 2px rgba(28,42,36,.05), 0 8px 28px rgba(28,42,36,.07)',
      pop:  '0 18px 50px rgba(28,42,36,.18)',
    },
  }}
}
