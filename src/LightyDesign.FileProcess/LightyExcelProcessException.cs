namespace LightyDesign.FileProcess;

public sealed class LightyExcelProcessException : Exception
{
    public LightyExcelProcessException(string message, string? worksheetName = null, string? cellAddress = null, Exception? innerException = null)
        : base(message, innerException)
    {
        WorksheetName = worksheetName;
        CellAddress = cellAddress;
    }

    public string? WorksheetName { get; }

    public string? CellAddress { get; }
}