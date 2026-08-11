using UnityEngine;

public sealed class WeaponPickup : MonoBehaviour
{
    [SerializeField] private string weaponName = "Lanzaburbujas";
    [SerializeField] private int damage = 25;
    [SerializeField] private float fireInterval = 0.35f;
    [SerializeField] private Color shotColor = Color.cyan;
    private Vector3 startPosition;

    public void Configure(string name, int weaponDamage, float interval, Color color)
    {
        weaponName = name;
        damage = weaponDamage;
        fireInterval = interval;
        shotColor = color;
    }

    private void Start() => startPosition = transform.position;

    private void Update()
    {
        transform.Rotate(0f, 55f * Time.deltaTime, 0f, Space.World);
        transform.position = startPosition + Vector3.up * (Mathf.Sin(Time.time * 2.2f) * 0.18f);
    }

    private void OnTriggerEnter(Collider other)
    {
        PlayerCombat combat = other.GetComponent<PlayerCombat>();
        if (combat == null) return;
        combat.Equip(weaponName, damage, fireInterval, shotColor);
        StartCoroutine(RespawnPickup());
    }

    private System.Collections.IEnumerator RespawnPickup()
    {
        foreach (Renderer renderer in GetComponentsInChildren<Renderer>()) renderer.enabled = false;
        GetComponent<Collider>().enabled = false;
        yield return new WaitForSeconds(10f);
        foreach (Renderer renderer in GetComponentsInChildren<Renderer>()) renderer.enabled = true;
        GetComponent<Collider>().enabled = true;
    }
}
