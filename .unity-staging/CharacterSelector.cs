using UnityEngine;

public sealed class CharacterSelector : MonoBehaviour
{
    [SerializeField] private GameObject[] characters;
    [SerializeField] private string[] characterNames;
    private int selectedIndex;

    public void Configure(GameObject[] variants, string[] names)
    {
        characters = variants;
        characterNames = names;
        Select(0);
    }

    private void Update()
    {
        if (Input.GetKeyDown(KeyCode.Alpha1)) Select(0);
        if (Input.GetKeyDown(KeyCode.Alpha2)) Select(1);
        if (Input.GetKeyDown(KeyCode.Alpha3)) Select(2);
        if (Input.GetKeyDown(KeyCode.Alpha4)) Select(3);
        if (Input.GetKeyDown(KeyCode.Alpha5)) Select(4);
    }

    private void Select(int index)
    {
        if (characters == null || index < 0 || index >= characters.Length) return;
        selectedIndex = index;
        for (int item = 0; item < characters.Length; item++)
        {
            if (characters[item] != null) characters[item].SetActive(item == selectedIndex);
        }
        PlayerCombat combat = GetComponent<PlayerCombat>();
        if (combat != null) combat.RefreshWeaponMount();
    }

    private void OnGUI()
    {
        GUI.Box(new Rect(16, 16, 310, 82), "Selecciona tu personaje");
        string selectedName = characterNames != null && selectedIndex < characterNames.Length
            ? characterNames[selectedIndex]
            : $"Personaje {selectedIndex + 1}";
        GUI.Label(new Rect(32, 44, 280, 22), $"Actual: {selectedName}");
        GUI.Label(new Rect(32, 66, 280, 22), "Pulsa 1, 2, 3 o 4 para cambiar");
    }
}
