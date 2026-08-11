using System.Collections;
using UnityEngine;

public sealed class PlayerCombat : MonoBehaviour
{
    private Camera aimCamera;
    private string weaponName = "Sin arma";
    private string abilityText = "Busca un arma brillante en el mapa";
    private int damage;
    private float fireInterval = 0.35f;
    private float nextShot;
    private Color shotColor = Color.cyan;
    private int ammo;
    private int magazineSize = 12;
    private bool reloading;
    private float hitMarkerUntil;
    private float crosshairKick;
    private int eliminations;
    private Transform weaponMount;
    private Transform muzzle;
    private Transform mountedHand;

    public void Equip(string newName, int newDamage, float newInterval, Color newColor)
    {
        weaponName = newName;
        damage = newDamage;
        fireInterval = newInterval;
        shotColor = newColor;
        magazineSize = newName == "Bláster de rebote" ? 20 : newName == "Cañón gelatinoso" ? 6 : 12;
        ammo = magazineSize;
        abilityText = newName switch
        {
            "Lanzaburbujas" => "Atrapa al rival durante 2,5 segundos",
            "Rayo encogedor" => "Encoge al rival durante 5 segundos",
            "Cañón gelatinoso" => "Explosión pegajosa con daño de área",
            "Bláster de rebote" => "El disparo salta a un segundo rival",
            _ => "Arma experimental",
        };
        BuildHeldWeapon();
    }

    private void Start() => aimCamera = Camera.main;

    private void Update()
    {
        crosshairKick = Mathf.MoveTowards(crosshairKick, 0f, Time.deltaTime * 30f);
        if (Input.GetKeyDown(KeyCode.R) && damage > 0 && ammo < magazineSize && !reloading) StartCoroutine(Reload());
        if (damage <= 0 || reloading || !Input.GetMouseButton(0) || Time.time < nextShot) return;
        if (ammo <= 0)
        {
            StartCoroutine(Reload());
            return;
        }
        if (aimCamera == null) aimCamera = Camera.main;
        if (aimCamera == null) return;
        ammo--;
        nextShot = Time.time + fireInterval;
        crosshairKick = Mathf.Min(crosshairKick + 3.5f, 12f);
        Shoot();
    }

    private void Shoot()
    {
        Ray ray = aimCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f));
        Vector3 end = ray.origin + ray.direction * 80f;
        CombatHealth primaryTarget = null;
        RaycastHit[] hits = Physics.RaycastAll(ray, 80f, ~0, QueryTriggerInteraction.Ignore);
        System.Array.Sort(hits, (left, right) => left.distance.CompareTo(right.distance));
        foreach (RaycastHit hit in hits)
        {
            if (hit.collider.transform.IsChildOf(transform)) continue;
            end = hit.point;
            primaryTarget = hit.collider.GetComponentInParent<CombatHealth>();
            if (primaryTarget != null && primaryTarget.gameObject != gameObject)
            {
                bool killed = primaryTarget.TakeDamage(damage);
                primaryTarget.ApplyAbility(weaponName);
                if (killed) eliminations++;
                hitMarkerUntil = Time.time + 0.18f;
                if (weaponName == "Bláster de rebote") ChainToSecondTarget(primaryTarget, end);
                if (weaponName == "Cañón gelatinoso") JellyExplosion(end, primaryTarget);
            }
            break;
        }
        Vector3 start = muzzle != null ? muzzle.position : transform.position + Vector3.up;
        StartCoroutine(ShowShot(start, end));
        StartCoroutine(ImpactFlash(end));
        Animator animator = GetComponentInChildren<Animator>();
        if (animator != null) animator.SetTrigger("Shoot");
    }

    private void ChainToSecondTarget(CombatHealth first, Vector3 start)
    {
        CombatHealth nearest = null;
        float nearestDistance = 12f;
        foreach (CombatHealth candidate in FindObjectsByType<CombatHealth>(FindObjectsSortMode.None))
        {
            if (candidate == first || candidate.gameObject == gameObject || candidate.IsDead) continue;
            float distance = Vector3.Distance(start, candidate.transform.position);
            if (distance >= nearestDistance) continue;
            nearest = candidate;
            nearestDistance = distance;
        }
        if (nearest == null) return;
        if (nearest.TakeDamage(Mathf.RoundToInt(damage * 0.7f))) eliminations++;
        StartCoroutine(ShowShot(start, nearest.transform.position + Vector3.up));
    }

    private void JellyExplosion(Vector3 point, CombatHealth primary)
    {
        foreach (Collider nearby in Physics.OverlapSphere(point, 4f, ~0, QueryTriggerInteraction.Ignore))
        {
            CombatHealth health = nearby.GetComponentInParent<CombatHealth>();
            if (health == null || health == primary || health.gameObject == gameObject) continue;
            health.TakeDamage(Mathf.RoundToInt(damage * 0.5f));
            health.ApplyAbility("Cañón gelatinoso");
        }
    }

    private IEnumerator Reload()
    {
        reloading = true;
        yield return new WaitForSeconds(1.25f);
        ammo = magazineSize;
        reloading = false;
    }

    private IEnumerator ShowShot(Vector3 start, Vector3 end)
    {
        GameObject effect = new("Visible Energy Shot");
        LineRenderer line = effect.AddComponent<LineRenderer>();
        line.positionCount = 2;
        line.SetPositions(new[] { start, end });
        line.startWidth = weaponName == "Cañón gelatinoso" ? 0.24f : 0.13f;
        line.endWidth = 0.035f;
        line.material = new Material(Shader.Find("Sprites/Default"));
        line.startColor = Color.white;
        line.endColor = new Color(shotColor.r, shotColor.g, shotColor.b, 0.15f);
        Light flash = effect.AddComponent<Light>();
        flash.color = shotColor;
        flash.intensity = 5f;
        flash.range = 4f;
        effect.transform.position = start;
        yield return new WaitForSeconds(0.11f);
        Destroy(effect);
    }

    private IEnumerator ImpactFlash(Vector3 point)
    {
        GameObject impact = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Destroy(impact.GetComponent<Collider>());
        impact.name = "Energy Impact";
        impact.transform.position = point;
        impact.transform.localScale = Vector3.one * 0.35f;
        Material material = new(Shader.Find("Universal Render Pipeline/Lit"));
        material.color = shotColor;
        impact.GetComponent<Renderer>().material = material;
        float elapsed = 0f;
        while (elapsed < 0.22f)
        {
            elapsed += Time.deltaTime;
            impact.transform.localScale += Vector3.one * Time.deltaTime * 4f;
            yield return null;
        }
        Destroy(impact);
    }

    private void BuildHeldWeapon()
    {
        if (weaponMount != null) Destroy(weaponMount.gameObject);
        GameObject root = new($"Held {weaponName}");
        weaponMount = root.transform;
        MountWeaponOnActiveCharacter();
        Material material = new(Shader.Find("Universal Render Pipeline/Lit"));
        material.color = shotColor;
        CreateWeaponPart(PrimitiveType.Cylinder, new Vector3(0f, 0.35f, 0f), new Vector3(0.16f, 0.55f, 0.16f), material);
        CreateWeaponPart(PrimitiveType.Cube, new Vector3(0f, -0.08f, 0.18f), new Vector3(0.22f, 0.35f, 0.18f), material);
        CreateWeaponPart(PrimitiveType.Sphere, new Vector3(0f, -0.25f, 0f), Vector3.one * 0.28f, material);
        muzzle = new GameObject("Muzzle").transform;
        muzzle.SetParent(weaponMount, false);
        muzzle.localPosition = new Vector3(0f, 0.95f, 0f);
    }

    public void RefreshWeaponMount()
    {
        if (weaponMount != null) MountWeaponOnActiveCharacter();
    }

    private void MountWeaponOnActiveCharacter()
    {
        Transform hand = FindActiveRightHand();
        mountedHand = hand;
        weaponMount.SetParent(hand != null ? hand : transform, false);
        if (hand != null)
        {
            weaponMount.localPosition = new Vector3(0.02f, 0.06f, 0.03f);
            weaponMount.localRotation = Quaternion.Euler(0f, 0f, 90f);
            weaponMount.localScale = Vector3.one * 0.75f;
        }
        else
        {
            weaponMount.localPosition = new Vector3(0.38f, 0.88f, 0.38f);
            weaponMount.localRotation = Quaternion.Euler(90f, 0f, 0f);
            weaponMount.localScale = Vector3.one;
        }
    }

    private Transform FindActiveRightHand()
    {
        foreach (Animator animator in GetComponentsInChildren<Animator>(false))
        {
            if (!animator.gameObject.activeInHierarchy) continue;
            if (animator.isHuman && animator.avatar != null)
            {
                Transform humanoidHand = animator.GetBoneTransform(HumanBodyBones.RightHand);
                if (humanoidHand != null) return humanoidHand;
            }
            foreach (Transform bone in animator.GetComponentsInChildren<Transform>(true))
            {
                string lower = bone.name.ToLowerInvariant().Replace("_", "").Replace(".", "");
                if (lower.Contains("righthand") || lower.Contains("handr")) return bone;
            }
        }
        return null;
    }

    private void CreateWeaponPart(PrimitiveType type, Vector3 localPosition, Vector3 scale, Material material)
    {
        GameObject part = GameObject.CreatePrimitive(type);
        part.transform.SetParent(weaponMount, false);
        part.transform.localPosition = localPosition;
        part.transform.localScale = scale;
        Destroy(part.GetComponent<Collider>());
        part.GetComponent<Renderer>().material = material;
    }

    private void OnGUI()
    {
        GUI.Box(new Rect(16, 142, 330, 58), $"Arma: {weaponName}\n{abilityText}");
        GUI.Box(new Rect(Screen.width - 190, 16, 174, 52), reloading ? "RECARGANDO..." : $"Munición  {ammo} / {magazineSize}\nBajas: {eliminations}");
        float centerX = Screen.width * 0.5f;
        float centerY = Screen.height * 0.5f;
        float gap = 7f + crosshairKick;
        Color previous = GUI.color;
        GUI.color = Time.time < hitMarkerUntil ? Color.red : Color.white;
        GUI.DrawTexture(new Rect(centerX - 1, centerY - gap - 8, 2, 8), Texture2D.whiteTexture);
        GUI.DrawTexture(new Rect(centerX - 1, centerY + gap, 2, 8), Texture2D.whiteTexture);
        GUI.DrawTexture(new Rect(centerX - gap - 8, centerY - 1, 8, 2), Texture2D.whiteTexture);
        GUI.DrawTexture(new Rect(centerX + gap, centerY - 1, 8, 2), Texture2D.whiteTexture);
        if (Time.time < hitMarkerUntil)
        {
            GUI.DrawTexture(new Rect(centerX - 9, centerY - 1, 18, 2), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(centerX - 1, centerY - 9, 2, 18), Texture2D.whiteTexture);
        }
        GUI.color = previous;
    }
}
