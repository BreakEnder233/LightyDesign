namespace LightyDesign.Application.Exceptions;

public abstract class AppException : Exception
{
    protected AppException(string message, int statusCode, string errorCode)
        : base(message)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }

    public int StatusCode { get; }
    public string ErrorCode { get; }
}

public sealed class WorkspaceNotFoundException : AppException
{
    public WorkspaceNotFoundException(string workspacePath)
        : base($"Workspace was not found at '{workspacePath}'.", 404, "WORKSPACE_NOT_FOUND")
    {
        WorkspacePath = workspacePath;
    }

    public string WorkspacePath { get; }
}

public sealed class WorkbookNotFoundException : AppException
{
    public WorkbookNotFoundException(string workbookName, string workspacePath)
        : base($"Workbook '{workbookName}' was not found in workspace '{workspacePath}'.", 404, "WORKBOOK_NOT_FOUND")
    {
        WorkbookName = workbookName;
        WorkspacePath = workspacePath;
    }

    public string WorkbookName { get; }
    public string WorkspacePath { get; }
}

public sealed class SheetNotFoundException : AppException
{
    public SheetNotFoundException(string sheetName, string workbookName)
        : base($"Sheet '{sheetName}' was not found in workbook '{workbookName}'.", 404, "SHEET_NOT_FOUND")
    {
        SheetName = sheetName;
        WorkbookName = workbookName;
    }

    public string SheetName { get; }
    public string WorkbookName { get; }
}

public sealed class FlowChartNotFoundException : AppException
{
    public FlowChartNotFoundException(string relativePath, string workspacePath)
        : base($"FlowChart asset '{relativePath}' was not found in workspace '{workspacePath}'.", 404, "FLOWCHART_NOT_FOUND")
    {
        RelativePath = relativePath;
        WorkspacePath = workspacePath;
    }

    public string RelativePath { get; }
    public string WorkspacePath { get; }
}

public sealed class ValidationException : AppException
{
    public ValidationException(string message)
        : base(message, 400, "VALIDATION_ERROR")
    {
    }
}

public sealed class PermissionException : AppException
{
    public PermissionException(string message)
        : base(message, 403, "PERMISSION_DENIED")
    {
    }
}
