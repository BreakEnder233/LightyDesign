namespace LightyDesign.Core;

public sealed class WorkspaceHeaderLayout
{
    private readonly IReadOnlyList<WorkspaceHeaderRowDefinition> _rows;

    public WorkspaceHeaderLayout(IEnumerable<WorkspaceHeaderRowDefinition> rows)
    {
        ArgumentNullException.ThrowIfNull(rows);

        _rows = rows.ToList().AsReadOnly();
    }

    public IReadOnlyList<WorkspaceHeaderRowDefinition> Rows => _rows;

    public int Count => _rows.Count;

    public WorkspaceHeaderRowDefinition this[int index] => _rows[index];

    public bool TryGetRow(string headerType, out WorkspaceHeaderRowDefinition? row)
    {
        ArgumentException.ThrowIfNullOrEmpty(headerType);

        row = _rows.FirstOrDefault(candidate => string.Equals(candidate.HeaderType, headerType, StringComparison.Ordinal));
        return row is not null;
    }
}