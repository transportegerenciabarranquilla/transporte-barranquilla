using System.Collections;
using UnityEngine;

public sealed class CombatHealth : MonoBehaviour
{
    [SerializeField] private int maximumHealth = 100;
    [SerializeField] private float respawnDelay = 3f;
    private int currentHealth;
    private Vector3 spawnPosition;
    private Quaternion spawnRotation;
    private bool dead;

    public bool IsDead => dead;

    private void Awake()
    {
        currentHealth = maximumHealth;
        spawnPosition = transform.position;
        spawnRotation = transform.rotation;
    }

    public bool TakeDamage(int damage)
    {
        if (dead) return false;
        currentHealth = Mathf.Max(0, currentHealth - Mathf.Max(0, damage));
        if (currentHealth == 0)
        {
            StartCoroutine(DieAndRespawn());
            return true;
        }
        return false;
    }

    public void ApplyAbility(string weaponName)
    {
        if (dead) return;
        if (weaponName == "Lanzaburbujas") StartCoroutine(BubbleEffect());
        else if (weaponName == "Rayo encogedor") StartCoroutine(ShrinkEffect());
        else if (weaponName == "Cañón gelatinoso") StartCoroutine(JellyEffect());
    }

    private IEnumerator BubbleEffect()
    {
        ThirdPersonPlayer player = GetComponent<ThirdPersonPlayer>();
        BotShooter bot = GetComponent<BotShooter>();
        CharacterController controller = GetComponent<CharacterController>();
        if (player != null) player.SetStunned(true);
        if (bot != null) bot.enabled = false;
        if (controller != null) controller.enabled = false;
        Vector3 groundPosition = transform.position;
        GameObject bubble = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Destroy(bubble.GetComponent<Collider>());
        bubble.name = "Bubble Trap";
        bubble.transform.SetParent(transform, false);
        bubble.transform.localPosition = Vector3.up;
        bubble.transform.localScale = Vector3.one * 2.4f;
        Material material = new(Shader.Find("Universal Render Pipeline/Lit"));
        material.color = new Color(0.1f, 0.85f, 1f, 0.28f);
        material.SetFloat("_Surface", 1f);
        material.SetFloat("_Blend", 0f);
        bubble.GetComponent<Renderer>().material = material;
        float elapsed = 0f;
        while (elapsed < 2.5f)
        {
            elapsed += Time.deltaTime;
            float lift = Mathf.Sin(Mathf.Clamp01(elapsed / 0.55f) * Mathf.PI * 0.5f) * 2.2f;
            float bob = Mathf.Sin(elapsed * 5f) * 0.16f;
            transform.position = groundPosition + Vector3.up * (lift + bob);
            bubble.transform.Rotate(15f * Time.deltaTime, 30f * Time.deltaTime, 0f);
            yield return null;
        }
        float descent = 0f;
        Vector3 floatingPosition = transform.position;
        while (descent < 0.35f)
        {
            descent += Time.deltaTime;
            transform.position = Vector3.Lerp(floatingPosition, groundPosition, descent / 0.35f);
            yield return null;
        }
        transform.position = groundPosition;
        Destroy(bubble);
        if (controller != null) controller.enabled = true;
        if (player != null) player.SetStunned(false);
        if (bot != null && !dead) bot.enabled = true;
    }

    private IEnumerator ShrinkEffect()
    {
        Vector3 originalScale = transform.localScale;
        Vector3 smallScale = originalScale * 0.42f;
        float elapsed = 0f;
        while (elapsed < 0.35f)
        {
            elapsed += Time.deltaTime;
            transform.localScale = Vector3.Lerp(originalScale, smallScale, elapsed / 0.35f);
            yield return null;
        }
        yield return new WaitForSeconds(4.3f);
        elapsed = 0f;
        while (elapsed < 0.35f)
        {
            elapsed += Time.deltaTime;
            transform.localScale = Vector3.Lerp(smallScale, originalScale, elapsed / 0.35f);
            yield return null;
        }
        transform.localScale = originalScale;
    }

    private IEnumerator JellyEffect()
    {
        ThirdPersonPlayer player = GetComponent<ThirdPersonPlayer>();
        BotShooter bot = GetComponent<BotShooter>();
        if (player != null) player.SetMovementMultiplier(0.35f);
        if (bot != null) bot.enabled = false;
        GameObject puddle = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(puddle.GetComponent<Collider>());
        puddle.name = "Jelly Puddle";
        puddle.transform.position = transform.position + Vector3.down * 0.9f;
        puddle.transform.localScale = new Vector3(2.2f, 0.06f, 2.2f);
        Material jelly = new(Shader.Find("Universal Render Pipeline/Lit"));
        jelly.color = new Color(0.25f, 1f, 0.2f, 0.75f);
        puddle.GetComponent<Renderer>().material = jelly;
        yield return new WaitForSeconds(3f);
        Destroy(puddle);
        if (player != null) player.SetMovementMultiplier(1f);
        if (bot != null && !dead) bot.enabled = true;
    }

    private IEnumerator DieAndRespawn()
    {
        dead = true;
        ThirdPersonPlayer player = GetComponent<ThirdPersonPlayer>();
        if (player != null) player.SetDead(true);
        PlayerCombat combat = GetComponent<PlayerCombat>();
        if (combat != null) combat.enabled = false;
        BotShooter bot = GetComponent<BotShooter>();
        if (bot != null) bot.enabled = false;

        Animator animator = GetComponentInChildren<Animator>();
        if (animator != null) animator.SetTrigger("Die");
        yield return new WaitForSeconds(respawnDelay);

        CharacterController controller = GetComponent<CharacterController>();
        if (controller != null) controller.enabled = false;
        transform.SetPositionAndRotation(spawnPosition, spawnRotation);
        if (controller != null) controller.enabled = true;
        currentHealth = maximumHealth;
        dead = false;
        if (player != null) player.SetDead(false);
        if (combat != null) combat.enabled = true;
        if (bot != null) bot.enabled = true;
        if (animator != null) animator.Play("Idle", 0, 0f);
    }

    private void OnGUI()
    {
        if (!CompareTag("Player")) return;
        GUI.Box(new Rect(16, 108, 220, 28), $"Vida: {currentHealth} / {maximumHealth}");
    }
}
