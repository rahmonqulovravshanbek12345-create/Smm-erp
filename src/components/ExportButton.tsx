import { useErp } from "../lib/store";
import { downloadXlsx, type SheetData } from "../lib/xlsx";
import { Icon } from "./icons";
import { Button } from "./ui";

/** Excel (.xlsx) eksport tugmasi. Ma'lumot bosilgan paytda yig'iladi. */
export function ExportButton({ filename, sheets, label = "Excel" }: { filename: string; sheets: () => SheetData[]; label?: string }) {
  const { showToast, state } = useErp();
  return (
    <Button
      className="no-print"
      onClick={() => {
        try {
          const data = sheets().map((sh) => ({ ...sh, title: sh.title ?? [state.settings.companyName, `${sh.name} · ${new Date().toLocaleDateString("ru-RU")}`] }));
          downloadXlsx(filename, data);
          showToast("Excel fayl tayyor");
        } catch {
          showToast("⚠ Faylni yaratib bo'lmadi");
        }
      }}
    >
      <Icon name="upload" size={15} className="rotate-180" /> {label}
    </Button>
  );
}
