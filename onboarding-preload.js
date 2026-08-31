// Brücke für die Ersteinrichtung. Bewusst klein gehalten: nur das, was der
// Assistent wirklich braucht.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vertionboard', {
  quellen: () => ipcRenderer.invoke('onboard:quellen'),
  importieren: (quelle) => ipcRenderer.invoke('onboard:import', quelle),
  standardbrowser: () => ipcRenderer.invoke('onboard:standardbrowser'),
  istStandard: () => ipcRenderer.invoke('onboard:iststandard'),
  vorschlaege: () => ipcRenderer.invoke('onboard:vorschlaege'),
  fertig: (ids) => ipcRenderer.invoke('onboard:fertig', ids),
  abbrechen: () => ipcRenderer.send('onboard:abbrechen'),
});
