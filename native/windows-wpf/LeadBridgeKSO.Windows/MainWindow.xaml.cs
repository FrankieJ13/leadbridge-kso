using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace LeadBridgeKSO.Windows;

public partial class MainWindow : Window
{
    private readonly Uri _pagesUri = new(AppSettings.GitHubPagesUrl);
    private bool _triedOfflineFallback;

    public MainWindow()
    {
        InitializeComponent();
        Title = $"{AppSettings.AppName} {AppSettings.Version}";
        Loaded += async (_, _) => await InitializeBrowserAsync();
    }

    private string OfflineIndexPath => Path.Combine(AppContext.BaseDirectory, "Web", "index.html");

    private async Task InitializeBrowserAsync()
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "LeadBridgeKSO",
                "WebView2");
            Directory.CreateDirectory(userDataFolder);

            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
            await Browser.EnsureCoreWebView2Async(environment);

            Browser.CoreWebView2.NavigationCompleted += Browser_NavigationCompleted;
            Browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            Browser.CoreWebView2.Settings.AreDevToolsEnabled = true;

            OpenGitHubPages();
        }
        catch (Exception ex)
        {
            StatusText.Text = "WebView2 init failed; opening offline copy.";
            MessageBox.Show(
                $"Could not initialize WebView2. Install Microsoft Edge WebView2 Runtime if needed.\n\n{ex.Message}",
                AppSettings.AppName,
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            OpenOffline();
        }
    }

    private void Browser_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            StatusText.Text = Browser.Source?.IsFile == true
                ? "Offline copy loaded. Files are processed locally."
                : "GitHub Pages loaded. Selected files are processed locally.";
            return;
        }

        if (!_triedOfflineFallback)
        {
            _triedOfflineFallback = true;
            StatusText.Text = "GitHub Pages unavailable; opening offline copy.";
            OpenOffline();
        }
        else
        {
            StatusText.Text = $"Navigation failed: {e.WebErrorStatus}";
        }
    }

    private void OpenGitHubPages()
    {
        _triedOfflineFallback = false;
        StatusText.Text = $"Opening {AppSettings.GitHubPagesUrl}";
        Browser.Source = _pagesUri;
    }

    private void OpenOffline()
    {
        if (!File.Exists(OfflineIndexPath))
        {
            StatusText.Text = "Offline HTML not found.";
            MessageBox.Show(
                $"Offline HTML not found:\n{OfflineIndexPath}",
                AppSettings.AppName,
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        Browser.Source = new Uri(OfflineIndexPath);
    }

    private void OpenGitHubPages_Click(object sender, RoutedEventArgs e) => OpenGitHubPages();

    private void OpenOffline_Click(object sender, RoutedEventArgs e) => OpenOffline();

    private void Reload_Click(object sender, RoutedEventArgs e)
    {
        if (Browser.CoreWebView2 is not null)
        {
            Browser.Reload();
        }
    }
}
