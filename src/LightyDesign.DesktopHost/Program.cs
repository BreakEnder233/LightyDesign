using System.Reflection;

var builder = WebApplication.CreateBuilder(args);
const string CorsPolicyName = "DesktopShell";

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(CorsPolicyName);

var entryAssembly = Assembly.GetEntryAssembly();
var version = entryAssembly?.GetName().Version?.ToString() ?? "unknown";
var repositoryRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
var workspaceFolders = new[]
{
    "app",
    "Spec",
    "src",
    "tests",
    "ShellFiles"
};

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    application = "LightyDesign.DesktopHost",
    environment = app.Environment.EnvironmentName,
    version,
    timestamp = DateTimeOffset.UtcNow,
    contentRoot = app.Environment.ContentRootPath,
    repositoryRoot,
}));

app.MapGet("/api/workspace/summary", () => Results.Ok(new
{
    repositoryRoot,
    folders = workspaceFolders
        .Select(folder => new
        {
            name = folder,
            exists = Directory.Exists(Path.Combine(repositoryRoot, folder)),
        })
        .ToArray(),
}));

app.Run();
