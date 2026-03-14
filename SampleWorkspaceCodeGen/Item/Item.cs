namespace LightyDesignData;

public sealed class ItemWorkbook
{
    public ConsumableTable Consumable { get; }
    public TestTable Test { get; }

    private ItemWorkbook(
        ConsumableTable consumable,
        TestTable test
    )
    {
        Consumable = consumable;
        Test = test;
    }

    internal static ItemWorkbook Create()
    {
        return new ItemWorkbook(
            ConsumableTable.Create(),
            TestTable.Create()
        );
    }
}
