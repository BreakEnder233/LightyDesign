namespace LightyDesignData;

public static class LDD
{
    public static ItemWorkbook Item { get; } = ItemWorkbook.Create();

    public static void Initialize()
    {
        _ = Item;
    }
}
