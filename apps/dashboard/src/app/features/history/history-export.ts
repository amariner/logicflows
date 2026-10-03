import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Entrega un fichero de texto al usuario (LF-88). En el navegador se
 * descarga; en la app Android, la vista web no descarga ficheros, así que se
 * guarda en la caché de la app y se abre el menú de compartir del sistema.
 */
@Injectable({ providedIn: 'root' })
export class FileExport {
  async save(name: string, content: string, mimeType: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.writeFile({
        path: name,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: name, files: [uri] });
      return;
    }
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
    } finally {
      // El navegador ya tiene el fichero: liberar la URL después del clic.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
    }
  }
}
