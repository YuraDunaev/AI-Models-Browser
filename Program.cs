using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using AiModelsBrowser;

namespace AiModelsBrowser;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        var logPath = Path.Combine(Path.GetTempPath(), "AIModelsBrowser_main.log");
        try { File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Main started{Environment.NewLine}"); } catch { }

        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Before Run{Environment.NewLine}");
            Application.Run(new MainForm());
            File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] After Run{Environment.NewLine}");
        }
        catch (Exception ex)
        {
            try { File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] FATAL: {ex}{Environment.NewLine}{ex.StackTrace}{Environment.NewLine}"); } catch { }
        }
    }
}
