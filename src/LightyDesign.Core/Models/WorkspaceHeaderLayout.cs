namespace LightyDesign.Core;

public sealed class WorkspaceHeaderLayout
{
    private readonly IReadOnlyList<WorkspaceHeaderRowDefinition> _rows;

    public WorkspaceHeaderLayout(IEnumerable<WorkspaceHeaderRowDefinition> rows)
    {
        ArgumentNullException.ThrowIfNull(rows);

        var resolvedRows = rows.ToList();
        var duplicatedHeaderType = resolvedRows
            .GroupBy(row => row.HeaderType, StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1)?
            .Key;

        if (duplicatedHeaderType is not null)
        {
            throw new ArgumentException($"Duplicated workspace header type '{duplicatedHeaderType}' is not allowed.", nameof(rows));
        }

        _rows = resolvedRows.AsReadOnly();
    }

    public static WorkspaceHeaderLayout CreateDefault()
    {
        return new WorkspaceHeaderLayout(
            LightyHeaderTypes.DefaultWorkspaceHeaderTypes.Select(headerType => new WorkspaceHeaderRowDefinition(
                headerType,
                System.Text.Json.JsonSerializer.SerializeToElement(new { }))));
    }

    public IReadOnlyList<WorkspaceHeaderRowDefinition> Rows => _rows;

    public int Count => _rows.Count;

    public WorkspaceHeaderRowDefinition this[int index] => _rows[index];

    public bool TryGetRow(string headerType, out WorkspaceHeaderRowDefinition? row)
    {
        ArgumentException.ThrowIfNullOrEmpty(headerType);

        var normalizedHeaderType = LightyHeaderTypes.Normalize(headerType);
        row = _rows.FirstOrDefault(candidate => string.Equals(candidate.HeaderType, normalizedHeaderType, StringComparison.Ordinal));
        return row is not null;
    }
}