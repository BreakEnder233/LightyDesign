using System.Text.Json;
using LightyDesign.Application.Exceptions;
using LightyDesign.Core;
using LightyDesign.FileProcess;

namespace LightyDesign.DesktopHost;

public sealed class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;

    public ErrorHandlingMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (AppException appEx)
        {
            await WriteErrorResponse(context, appEx.StatusCode, appEx.ErrorCode, appEx.Message);
        }
        catch (FileNotFoundException ex)
        {
            await WriteNotFoundResponse(context, ex.Message, ex.FileName);
        }
        catch (DirectoryNotFoundException ex)
        {
            await WriteNotFoundResponse(context, ex.Message, null);
        }
        catch (UnauthorizedAccessException ex)
        {
            await WriteErrorResponse(context, 400, "ACCESS_DENIED", ex.Message);
        }
        catch (IOException ex)
        {
            await WriteErrorResponse(context, 400, "IO_ERROR", ex.Message);
        }
        catch (LightyCoreException ex)
        {
            await WriteErrorResponse(context, 400, "CORE_ERROR", ex.Message);
        }
        catch (LightyExcelProcessException ex)
        {
            await WriteExcelErrorResponse(context, ex);
        }
        catch (ArgumentException ex)
        {
            await WriteErrorResponse(context, 400, "INVALID_ARGUMENT", ex.Message);
        }
        catch (JsonException ex)
        {
            await WriteErrorResponse(context, 400, "INVALID_JSON", ex.Message);
        }
    }

    private static async Task WriteNotFoundResponse(HttpContext context, string message, string? path)
    {
        context.Response.StatusCode = 404;
        context.Response.ContentType = "application/json; charset=utf-8";

        var body = path is not null
            ? JsonSerializer.Serialize(new { error = message, path })
            : JsonSerializer.Serialize(new { error = message });

        await context.Response.WriteAsync(body);
    }

    private static async Task WriteErrorResponse(HttpContext context, int statusCode, string code, string message)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json; charset=utf-8";

        var body = JsonSerializer.Serialize(new
        {
            error = message,
            errorCode = code,
        });

        await context.Response.WriteAsync(body);
    }

    private static async Task WriteExcelErrorResponse(HttpContext context, LightyExcelProcessException ex)
    {
        context.Response.StatusCode = 400;
        context.Response.ContentType = "application/json; charset=utf-8";

        var body = JsonSerializer.Serialize(new
        {
            error = ex.Message,
            errorCode = "EXCEL_ERROR",
            worksheetName = ex.WorksheetName,
            cellAddress = ex.CellAddress,
        });

        await context.Response.WriteAsync(body);
    }
}
